const { app, request, registerUser } = require('./setup');
const db = require('../src/database');
const { generateCheckMacValue, queryTradeInfo, ECPAY_CONFIG } = require('../src/utils/ecpay');

function formTradeNo(html) {
  return html.match(/name="MerchantTradeNo" value="([^"]+)"/)[1];
}

// 回應依綠界規則簽章並回帶查詢編號；signed 覆寫簽章前欄位（他筆交易的真實回應），tampered 覆寫簽章後欄位（竄改）；tradeStatus 為 undefined 時回應不含 TradeStatus
function stubQueryTradeInfo(tradeStatus, { signed = {}, tampered = {} } = {}) {
  const fetchMock = vi.fn(async (url, init) => {
    const fields = {
      MerchantID: ECPAY_CONFIG.merchantId,
      MerchantTradeNo: new URLSearchParams(init.body).get('MerchantTradeNo'),
      ...(tradeStatus !== undefined && { TradeStatus: tradeStatus }),
      ...signed,
    };
    fields.CheckMacValue = generateCheckMacValue(fields, ECPAY_CONFIG.hashKey, ECPAY_CONFIG.hashIV);
    const body = Object.entries({ ...fields, ...tampered }).map(([k, v]) => `${k}=${v}`).join('&');
    return { ok: true, text: async () => body };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function createOrder() {
  const { token } = await registerUser();
  const prodRes = await request(app).get('/api/products');
  await request(app)
    .post('/api/cart')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId: prodRes.body.data.products[0].id, quantity: 1 });
  const res = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({
      recipientName: '測試收件人',
      recipientEmail: 'recipient@example.com',
      recipientAddress: '台北市測試路 123 號',
    });
  return { token, orderId: res.body.data.id };
}

describe('ECPay payment attempts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('issues a fresh MerchantTradeNo per attempt and check-payment queries the latest', async () => {
    const { token, orderId } = await createOrder();
    const fetchMock = stubQueryTradeInfo('0');

    const first = await request(app).get('/ecpay/payment/' + orderId);
    const second = await request(app).get('/ecpay/payment/' + orderId);
    const firstNo = formTradeNo(first.text);
    const secondNo = formTradeNo(second.text);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(secondNo).not.toBe(firstNo);
    // 換號前查詢的是上一次送出的編號
    expect(new URLSearchParams(fetchMock.mock.calls[1][1].body).get('MerchantTradeNo')).toBe(firstNo);
    for (const no of [firstNo, secondNo]) {
      expect(no).toMatch(/^[A-Za-z0-9]{1,20}$/);
    }

    fetchMock.mockClear();
    const check = await request(app)
      .post(`/api/orders/${orderId}/check-payment`)
      .set('Authorization', `Bearer ${token}`);

    expect(check.status).toBe(200);
    expect(new URLSearchParams(fetchMock.mock.calls[0][1].body).get('MerchantTradeNo')).toBe(secondNo);
  });

  it('marks the order paid instead of issuing a new attempt when the stored trade no was paid', async () => {
    // 修正前建立的訂單，merchant_trade_no 仍是原始編號且可能已送過綠界
    const { orderId } = await createOrder();
    stubQueryTradeInfo('1');
    const retry = await request(app).get('/ecpay/payment/' + orderId);

    expect(retry.status).toBe(302);
    expect(retry.headers.location).toBe('/orders/' + orderId);
    expect(db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId).status).toBe('paid');
  });

  it.each(['10200047', '10200095'])('issues the next trade no when ECPay reports %s (never sent / failed)', async (tradeStatus) => {
    const { orderId } = await createOrder();
    stubQueryTradeInfo(tradeStatus);

    const res = await request(app).get('/ecpay/payment/' + orderId);

    expect(res.status).toBe(200);
    expect(formTradeNo(res.text)).toMatch(/01$/);
  });

  it.each([
    ['HTTP error', () => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })))],
    ['unsigned error response', () => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => 'Error=TimeStamp expired' })))],
    ['signed response without TradeStatus', () => stubQueryTradeInfo(undefined)],
    ['signed unknown TradeStatus', () => stubQueryTradeInfo('10299999')],
  ])('keeps the current trade no and redirects to the order page when QueryTradeInfo fails (%s)', async (_label, stub) => {
    const { orderId } = await createOrder();
    const before = db.prepare('SELECT merchant_trade_no FROM orders WHERE id = ?').get(orderId).merchant_trade_no;
    stub();

    const res = await request(app).get('/ecpay/payment/' + orderId);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/orders/${orderId}?payment=unavailable`);
    expect(db.prepare('SELECT merchant_trade_no FROM orders WHERE id = ?').get(orderId).merchant_trade_no).toBe(before);
  });

  it('lets only one of two concurrent attempts claim the next trade no', async () => {
    const { orderId } = await createOrder();
    const fetchMock = stubQueryTradeInfo('0');
    const reply = fetchMock.getMockImplementation();
    // 兩個請求都讀到同一個目前編號後才放行查詢，重現併發換號
    let release;
    const bothQueried = new Promise((resolve) => { release = resolve; });
    const gateTimeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('第二個請求未到達 QueryTradeInfo')), 1000);
    });
    fetchMock.mockImplementation(async (...args) => {
      if (fetchMock.mock.calls.length === 2) release();
      await Promise.race([bothQueried, gateTimeout]);
      return reply(...args);
    });

    const responses = await Promise.all([
      request(app).get('/ecpay/payment/' + orderId),
      request(app).get('/ecpay/payment/' + orderId),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 302]);
    // 落敗者須走條件式更新失敗的導回，而非閘門逾時造成的查詢失敗（?payment=unavailable）
    expect(responses.find((r) => r.status === 302).headers.location).toBe('/orders/' + orderId);
    const form = responses.find((r) => r.status === 200);
    expect(db.prepare('SELECT merchant_trade_no FROM orders WHERE id = ?').get(orderId).merchant_trade_no).toBe(formTradeNo(form.text));
  });

  it('does not render a form when the order becomes paid while QueryTradeInfo is in flight', async () => {
    const { orderId } = await createOrder();
    const before = db.prepare('SELECT merchant_trade_no FROM orders WHERE id = ?').get(orderId).merchant_trade_no;
    const fetchMock = stubQueryTradeInfo('0');
    const reply = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (...args) => {
      // 例如另一個分頁的 check-payment 在查詢期間標記已付款
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('paid', orderId);
      return reply(...args);
    });

    const res = await request(app).get('/ecpay/payment/' + orderId);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/orders/' + orderId);
    expect(db.prepare('SELECT merchant_trade_no FROM orders WHERE id = ?').get(orderId).merchant_trade_no).toBe(before);
  });

  it('rejects the attempt once the next trade no would exceed 20 characters', async () => {
    const { orderId } = await createOrder();
    const { order_no } = db.prepare('SELECT order_no FROM orders WHERE id = ?').get(orderId);
    db.prepare('UPDATE orders SET merchant_trade_no = ? WHERE id = ?').run(order_no.replace(/-/g, '') + '9999', orderId);
    stubQueryTradeInfo('0');

    const res = await request(app).get('/ecpay/payment/' + orderId);

    expect(res.status).toBe(400);
  });

  it('check-payment rejects tampered or other-trade responses and accepts a genuine one', async () => {
    const { token, orderId } = await createOrder();

    for (const forge of [{ tampered: { TradeStatus: '1' } }, { signed: { MerchantTradeNo: 'ORD20260101OTHER01' } }]) {
      stubQueryTradeInfo(forge.tampered ? '0' : '1', forge);
      const forged = await request(app)
        .post(`/api/orders/${orderId}/check-payment`)
        .set('Authorization', `Bearer ${token}`);

      expect(forged.status).toBe(500);
      expect(forged.body.error).toBe('ECPAY_QUERY_ERROR');
      expect(db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId).status).toBe('pending');
    }

    stubQueryTradeInfo('1');
    const genuine = await request(app)
      .post(`/api/orders/${orderId}/check-payment`)
      .set('Authorization', `Bearer ${token}`);

    expect(genuine.status).toBe(200);
    expect(genuine.body.data.status).toBe('paid');
  });

  it('payment retry does not trust a forged paid status', async () => {
    const { orderId } = await createOrder();
    stubQueryTradeInfo('0');
    const first = await request(app).get('/ecpay/payment/' + orderId);

    stubQueryTradeInfo('0', { tampered: { TradeStatus: '1' } });
    const retry = await request(app).get('/ecpay/payment/' + orderId);

    expect(retry.status).toBe(302);
    expect(retry.headers.location).toBe(`/orders/${orderId}?payment=unavailable`);
    expect(db.prepare('SELECT status, merchant_trade_no FROM orders WHERE id = ?').get(orderId))
      .toEqual({ status: 'pending', merchant_trade_no: formTradeNo(first.text) });
  });
});

describe('ECPay QueryTradeInfo genuine staging responses', () => {
  // 綠界 staging（MerchantID 3002607）實際回應原文，值未經 URL 編碼；確認解析與驗簽和綠界相容，避免 fail-closed 誤拒
  // 綠界公開的 staging 測試金鑰（同 src/utils/ecpay.js 預設值），寫死以免環境變數覆寫影響 fixture
  const STAGING = { ...ECPAY_CONFIG, hashKey: 'pwFHCqoQZGmho4w6', hashIV: 'EkRm7iFT261dpevs' }; // gitleaks:allow
  const PAID = 'CustomField1=&CustomField2=&CustomField3=&CustomField4=&HandlingCharge=60&ItemName=粉色玫瑰花束 x1#紫色鬱金香盆栽 x1&MerchantID=3002607&MerchantTradeNo=ORD20260927D300D&PaymentDate=2026/09/27 16:30:59&PaymentType=Credit_CreditCard&PaymentTypeChargeFee=61&StoreID=&TradeAmt=2430&TradeDate=2026/09/27 16:28:39&TradeNo=2609271628390061&TradeStatus=1&CheckMacValue=A75D7DC7111B63171B25659CD256D8B0BEE62F85D003F6E8B1C9D79F0567E388';
  // 送出的 ItemName 為 'A%41=B+C 50% x1#玫瑰'，綠界把 = 轉為空白，+ 與 % 原樣回傳
  const UNPAID_SPECIAL_CHARS = 'CustomField1=&CustomField2=&CustomField3=&CustomField4=&HandlingCharge=0&ItemName=A%41 B+C 50% x1#玫瑰&MerchantID=3002607&MerchantTradeNo=CMVT1790500783393&PaymentDate=&PaymentType=&PaymentTypeChargeFee=0&StoreID=&TradeAmt=100&TradeDate=2026/09/27 17:19:43&TradeNo=2609271719430090&TradeStatus=0&CheckMacValue=A4CB290D6DEC3243B24F8D2DC18F6F88EDA20EA79636A2DF1028CAEF7AD3294A';
  // 從未送出的編號：綠界回 10200047 且仍帶簽章，首次付款換號前的查詢須通過驗簽
  const NOT_FOUND = 'HandlingCharge=0&ItemName=&MerchantID=3002607&MerchantTradeNo=PRB1790506627828&PaymentDate=&PaymentType=&PaymentTypeChargeFee=0&TradeAmt=0&TradeDate=&TradeNo=&TradeStatus=10200047&CheckMacValue=5648F8E8354B11940F611ADE50CCA58DD4916DCC960DF7BF4D73960DBE432366';

  function stubResponse(body) {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => body })));
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['ORD20260927D300D', PAID, '1', '粉色玫瑰花束 x1#紫色鬱金香盆栽 x1'],
    ['CMVT1790500783393', UNPAID_SPECIAL_CHARS, '0', 'A%41 B+C 50% x1#玫瑰'],
    ['PRB1790506627828', NOT_FOUND, '10200047', ''],
  ])('parses and verifies %s', async (tradeNo, body, tradeStatus, itemName) => {
    stubResponse(body);
    const result = await queryTradeInfo(tradeNo, STAGING);

    expect(result.TradeStatus).toBe(tradeStatus);
    expect(result.ItemName).toBe(itemName);
  });

  it('rejects a genuine response once a field is altered', async () => {
    stubResponse(PAID.replace('TradeAmt=2430', 'TradeAmt=1'));
    await expect(queryTradeInfo('ORD20260927D300D', STAGING)).rejects.toThrow('CheckMacValue');
  });
});
