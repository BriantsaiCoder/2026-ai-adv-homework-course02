const { app, request, registerUser } = require('./setup');
const db = require('../src/database');
const { generateCheckMacValue, verifyCheckMacValue, ECPAY_CONFIG } = require('../src/utils/ecpay');

function formTradeNo(html) {
  return html.match(/name="MerchantTradeNo" value="([^"]+)"/)[1];
}

// 回應依綠界規則簽章並回帶查詢編號；signed 覆寫簽章前欄位（他筆交易的真實回應），tampered 覆寫簽章後欄位（竄改）
function stubQueryTradeInfo(tradeStatus, { signed = {}, tampered = {} } = {}) {
  const fetchMock = vi.fn(async (url, init) => {
    const fields = {
      MerchantID: ECPAY_CONFIG.merchantId,
      MerchantTradeNo: new URLSearchParams(init.body).get('MerchantTradeNo'),
      TradeStatus: tradeStatus,
      ...signed,
    };
    fields.CheckMacValue = generateCheckMacValue(fields, ECPAY_CONFIG.hashKey, ECPAY_CONFIG.hashIV);
    return { ok: true, text: async () => new URLSearchParams({ ...fields, ...tampered }).toString() };
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

  it('marks the order paid instead of issuing a new attempt when the previous one was paid', async () => {
    const { orderId } = await createOrder();
    stubQueryTradeInfo('0');
    await request(app).get('/ecpay/payment/' + orderId);

    stubQueryTradeInfo('1');
    const retry = await request(app).get('/ecpay/payment/' + orderId);

    expect(retry.status).toBe(302);
    expect(retry.headers.location).toBe('/orders/' + orderId);
    expect(db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId).status).toBe('paid');
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
    expect(retry.headers.location).toBe(`/orders/${orderId}?payment=pending`);
    expect(db.prepare('SELECT status, merchant_trade_no FROM orders WHERE id = ?').get(orderId))
      .toEqual({ status: 'pending', merchant_trade_no: formTradeNo(first.text) });
  });
});

describe('ECPay QueryTradeInfo signature', () => {
  // 綠界 staging（MerchantID 3002607）實際回傳的已付款回應原文；確認驗簽與綠界算法相容，避免 fail-closed 誤拒真實付款
  it('accepts a genuine staging response', () => {
    const body = 'CustomField1=&CustomField2=&CustomField3=&CustomField4=&HandlingCharge=60&ItemName=粉色玫瑰花束 x1#紫色鬱金香盆栽 x1&MerchantID=3002607&MerchantTradeNo=ORD20260927D300D&PaymentDate=2026/09/27 16:30:59&PaymentType=Credit_CreditCard&PaymentTypeChargeFee=61&StoreID=&TradeAmt=2430&TradeDate=2026/09/27 16:28:39&TradeNo=2609271628390061&TradeStatus=1&CheckMacValue=A75D7DC7111B63171B25659CD256D8B0BEE62F85D003F6E8B1C9D79F0567E388';
    const params = Object.fromEntries(new URLSearchParams(body));

    expect(verifyCheckMacValue(params, 'pwFHCqoQZGmho4w6', 'EkRm7iFT261dpevs')).toBe(true);
    expect(verifyCheckMacValue({ ...params, TradeAmt: '1' }, 'pwFHCqoQZGmho4w6', 'EkRm7iFT261dpevs')).toBe(false);
  });
});
