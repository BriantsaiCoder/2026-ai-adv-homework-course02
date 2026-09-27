const { app, request, registerUser } = require('./setup');
const db = require('../src/database');
const { generateCheckMacValue, ECPAY_CONFIG } = require('../src/utils/ecpay');

function formTradeNo(html) {
  return html.match(/name="MerchantTradeNo" value="([^"]+)"/)[1];
}

// 回應依綠界規則簽章；給 signedStatus 時以該狀態簽章後再竄改 TradeStatus，模擬偽造回應
function stubQueryTradeInfo(tradeStatus, signedStatus = tradeStatus) {
  const fields = { MerchantID: ECPAY_CONFIG.merchantId, TradeStatus: signedStatus };
  fields.CheckMacValue = generateCheckMacValue(fields, ECPAY_CONFIG.hashKey, ECPAY_CONFIG.hashIV);
  fields.TradeStatus = tradeStatus;
  const fetchMock = vi.fn(async () => ({
    ok: true,
    text: async () => new URLSearchParams(fields).toString(),
  }));
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

  it('check-payment rejects a response whose CheckMacValue does not match', async () => {
    const { token, orderId } = await createOrder();

    stubQueryTradeInfo('1', '0');
    const forged = await request(app)
      .post(`/api/orders/${orderId}/check-payment`)
      .set('Authorization', `Bearer ${token}`);

    expect(forged.status).toBe(500);
    expect(forged.body.error).toBe('ECPAY_QUERY_ERROR');
    expect(db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId).status).toBe('pending');

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

    stubQueryTradeInfo('1', '0');
    const retry = await request(app).get('/ecpay/payment/' + orderId);

    expect(retry.status).toBe(302);
    expect(retry.headers.location).toBe(`/orders/${orderId}?payment=pending`);
    expect(db.prepare('SELECT status, merchant_trade_no FROM orders WHERE id = ?').get(orderId))
      .toEqual({ status: 'pending', merchant_trade_no: formTradeNo(first.text) });
  });
});
