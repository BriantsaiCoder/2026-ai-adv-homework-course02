const { app, request, registerUser } = require('./setup');
const db = require('../src/database');
const { generateCheckMacValue, queryTradeInfo, ECPAY_CONFIG } = require('../src/utils/ecpay');

function attempt(token, orderId) {
  return request(app)
    .post(`/api/orders/${orderId}/payment-attempt`)
    .set('Authorization', `Bearer ${token}`);
}

function tradeNoOf(orderId) {
  return db.prepare('SELECT merchant_trade_no FROM orders WHERE id = ?').get(orderId).merchant_trade_no;
}

// 回應依綠界規則簽章並回帶查詢編號；signed 覆寫簽章前欄位（他筆交易的真實回應），tampered 覆寫簽章後欄位（竄改）；tradeStatus 為 undefined 時回應不含 TradeStatus，為函式時依查詢編號決定
function stubQueryTradeInfo(tradeStatus, { signed = {}, tampered = {} } = {}) {
  const fetchMock = vi.fn(async (url, init) => {
    const tradeNo = new URLSearchParams(init.body).get('MerchantTradeNo');
    const status = typeof tradeStatus === 'function' ? tradeStatus(tradeNo) : tradeStatus;
    const fields = {
      MerchantID: ECPAY_CONFIG.merchantId,
      MerchantTradeNo: tradeNo,
      ...(status !== undefined && { TradeStatus: status }),
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

  it('issues a fresh MerchantTradeNo per attempt and check-payment queries every issued number newest-first', async () => {
    const { token, orderId } = await createOrder();
    const fetchMock = stubQueryTradeInfo('0');

    const first = await attempt(token, orderId);
    const second = await attempt(token, orderId);
    const firstNo = first.body.data.fields.MerchantTradeNo;
    const secondNo = second.body.data.fields.MerchantTradeNo;

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.data.action).toBe(ECPAY_CONFIG.aioCheckOutUrl);
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
    // 由新到舊查到原始編號
    expect(fetchMock.mock.calls.map(([, init]) => new URLSearchParams(init.body).get('MerchantTradeNo')))
      .toEqual([secondNo, firstNo, firstNo.slice(0, -2)]);
  });

  it('only lets the order owner start an attempt', async () => {
    const { orderId } = await createOrder();
    const { token: strangerToken } = await registerUser();
    const before = tradeNoOf(orderId);
    const fetchMock = stubQueryTradeInfo('0');

    const anonymous = await request(app).post(`/api/orders/${orderId}/payment-attempt`);
    const stranger = await attempt(strangerToken, orderId);
    // 舊的公開頁面路由不得再換號
    const legacyPage = await request(app).get('/ecpay/payment/' + orderId);

    expect(anonymous.status).toBe(401);
    expect(stranger.status).toBe(404);
    expect(legacyPage.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tradeNoOf(orderId)).toBe(before);
  });

  it('marks the order paid instead of issuing a new attempt when the stored trade no was paid', async () => {
    // 修正前建立的訂單，merchant_trade_no 仍是原始編號且可能已送過綠界
    const { token, orderId } = await createOrder();
    stubQueryTradeInfo('1');
    const retry = await attempt(token, orderId);

    expect(retry.status).toBe(409);
    expect(retry.body.error).toBe('ORDER_PAID');
    expect(db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId).status).toBe('paid');
  });

  it.each([
    ['payment-attempt', (token, orderId) => attempt(token, orderId), 409],
    ['check-payment', (token, orderId) => request(app).post(`/api/orders/${orderId}/check-payment`).set('Authorization', `Bearer ${token}`), 200],
  ])('%s finds a payment completed on an earlier trade no after renumbering', async (_label, call, expectedStatus) => {
    const { token, orderId } = await createOrder();
    stubQueryTradeInfo('0');
    const firstNo = (await attempt(token, orderId)).body.data.fields.MerchantTradeNo;
    await attempt(token, orderId);
    // 例如在第一次嘗試取得 ATM 代碼，換號後才繳費
    stubQueryTradeInfo((tradeNo) => (tradeNo === firstNo ? '1' : '0'));

    const res = await call(token, orderId);

    expect(res.status).toBe(expectedStatus);
    expect(db.prepare('SELECT status, merchant_trade_no FROM orders WHERE id = ?').get(orderId))
      .toEqual({ status: 'paid', merchant_trade_no: firstNo });
  });

  it.each(['10200047', '10200095'])('issues the next trade no when ECPay reports %s (never sent / failed)', async (tradeStatus) => {
    const { token, orderId } = await createOrder();
    stubQueryTradeInfo(tradeStatus);

    const res = await attempt(token, orderId);

    expect(res.status).toBe(200);
    expect(res.body.data.fields.MerchantTradeNo).toMatch(/01$/);
  });

  it.each([
    ['HTTP error', () => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })))],
    ['unsigned error response', () => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => 'Error=TimeStamp expired' })))],
    ['signed response without TradeStatus', () => stubQueryTradeInfo(undefined)],
    ['signed unknown TradeStatus', () => stubQueryTradeInfo('10299999')],
    ['signed unpaid response of another trade', () => stubQueryTradeInfo('0', { signed: { MerchantTradeNo: 'ORD20260101OTHER01' } })],
  ])('keeps the current trade no when QueryTradeInfo cannot confirm it is unpaid (%s)', async (_label, stub) => {
    const { token, orderId } = await createOrder();
    const before = tradeNoOf(orderId);
    stub();

    const res = await attempt(token, orderId);

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('ECPAY_UNAVAILABLE');
    expect(tradeNoOf(orderId)).toBe(before);
  });

  it('lets only one of two concurrent attempts claim the next trade no', async () => {
    const { token, orderId } = await createOrder();
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

    const responses = await Promise.all([attempt(token, orderId), attempt(token, orderId)]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    // 落敗者須是條件式更新失敗，而非閘門逾時造成的查詢失敗（503）
    expect(responses.find((r) => r.status === 409).body.error).toBe('PAYMENT_ATTEMPT_CONFLICT');
    const form = responses.find((r) => r.status === 200);
    expect(tradeNoOf(orderId)).toBe(form.body.data.fields.MerchantTradeNo);
  });

  it('does not issue a form when the order becomes paid while QueryTradeInfo is in flight', async () => {
    const { token, orderId } = await createOrder();
    const before = tradeNoOf(orderId);
    const fetchMock = stubQueryTradeInfo('0');
    const reply = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (...args) => {
      // 例如另一個分頁的 check-payment 在查詢期間標記已付款
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('paid', orderId);
      return reply(...args);
    });

    const res = await attempt(token, orderId);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('PAYMENT_ATTEMPT_CONFLICT');
    expect(tradeNoOf(orderId)).toBe(before);
  });

  it('rejects a new attempt after 99 attempts but still detects a paid order', async () => {
    const { token, orderId } = await createOrder();
    const { order_no } = db.prepare('SELECT order_no FROM orders WHERE id = ?').get(orderId);
    db.prepare('UPDATE orders SET merchant_trade_no = ? WHERE id = ?').run(order_no.replace(/-/g, '') + '99', orderId);
    const fetchMock = stubQueryTradeInfo('0');

    const limited = await attempt(token, orderId);

    expect(limited.status).toBe(400);
    expect(limited.body.error).toBe('PAYMENT_ATTEMPT_LIMIT');
    expect(fetchMock).toHaveBeenCalledTimes(100);

    stubQueryTradeInfo((tradeNo) => (tradeNo.endsWith('99') ? '1' : '0'));
    const paid = await attempt(token, orderId);

    expect(paid.status).toBe(409);
    expect(paid.body.error).toBe('ORDER_PAID');
  });

  it('keeps the trade no when the stored suffix is not numeric', async () => {
    const { token, orderId } = await createOrder();
    const { order_no } = db.prepare('SELECT order_no FROM orders WHERE id = ?').get(orderId);
    const corrupt = order_no.replace(/-/g, '') + 'A1';
    db.prepare('UPDATE orders SET merchant_trade_no = ? WHERE id = ?').run(corrupt, orderId);
    stubQueryTradeInfo('0');

    const res = await attempt(token, orderId);

    expect(res.status).toBe(503);
    expect(tradeNoOf(orderId)).toBe(corrupt);
  });

  it.each([
    ['HTTP error', 500, (firstNo) => {
      const fetchMock = stubQueryTradeInfo('0');
      const reply = fetchMock.getMockImplementation();
      fetchMock.mockImplementation(async (url, init) => (
        new URLSearchParams(init.body).get('MerchantTradeNo') === firstNo ? { ok: false, status: 500 } : reply(url, init)
      ));
    }],
    ['unknown TradeStatus', 200, (firstNo) => stubQueryTradeInfo((tradeNo) => (tradeNo === firstNo ? '10299999' : '0'))],
  ])('keeps the current trade no when an earlier trade no cannot be confirmed unpaid (%s)', async (_label, checkStatus, stub) => {
    const { token, orderId } = await createOrder();
    stubQueryTradeInfo('0');
    const firstNo = (await attempt(token, orderId)).body.data.fields.MerchantTradeNo;
    const secondNo = (await attempt(token, orderId)).body.data.fields.MerchantTradeNo;
    stub(firstNo);

    const retry = await attempt(token, orderId);
    const check = await request(app)
      .post(`/api/orders/${orderId}/check-payment`)
      .set('Authorization', `Bearer ${token}`);

    expect(retry.status).toBe(503);
    expect(retry.body.error).toBe('ECPAY_UNAVAILABLE');
    expect(check.status).toBe(checkStatus);
    expect(db.prepare('SELECT status, merchant_trade_no FROM orders WHERE id = ?').get(orderId))
      .toEqual({ status: 'pending', merchant_trade_no: secondNo });
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
    const { token, orderId } = await createOrder();
    stubQueryTradeInfo('0');
    const first = await attempt(token, orderId);

    for (const forge of [{ tampered: { TradeStatus: '1' } }, { signed: { MerchantTradeNo: 'ORD20260101OTHER01' } }]) {
      stubQueryTradeInfo(forge.tampered ? '0' : '1', forge);
      const retry = await attempt(token, orderId);

      expect(retry.status).toBe(503);
      expect(db.prepare('SELECT status, merchant_trade_no FROM orders WHERE id = ?').get(orderId))
        .toEqual({ status: 'pending', merchant_trade_no: first.body.data.fields.MerchantTradeNo });
    }
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
