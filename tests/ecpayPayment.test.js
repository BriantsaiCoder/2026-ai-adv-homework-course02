const { app, request, registerUser } = require('./setup');
const db = require('../src/database');

function formTradeNo(html) {
  return html.match(/name="MerchantTradeNo" value="([^"]+)"/)[1];
}

function stubQueryTradeInfo(tradeStatus) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    text: async () => `TradeStatus=${tradeStatus}`,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function createOrder() {
  const { token } = await registerUser();
  const prodRes = await request(app).get('/api/products');
  const productId = prodRes.body.data.products[0].id;
  await request(app)
    .post('/api/cart')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId, quantity: 1 });
  const res = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({
      recipientName: '測試收件人',
      recipientEmail: 'recipient@example.com',
      recipientAddress: '台北市測試路 123 號',
    });
  // 測試共用 database.sqlite，歸還建單扣掉的庫存，避免耗盡後其他測試失敗
  db.prepare('UPDATE products SET stock = stock + 1 WHERE id = ?').run(productId);
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

  it('marks the order paid instead of issuing a new attempt when the stored trade no was paid', async () => {
    // 修正前建立的訂單，merchant_trade_no 仍是原始編號且可能已送過綠界
    const { orderId } = await createOrder();
    stubQueryTradeInfo('1');
    const retry = await request(app).get('/ecpay/payment/' + orderId);

    expect(retry.status).toBe(302);
    expect(retry.headers.location).toBe('/orders/' + orderId);
    expect(db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId).status).toBe('paid');
  });

  it('keeps the current trade no and redirects to the order page when QueryTradeInfo fails', async () => {
    const { orderId } = await createOrder();
    const before = db.prepare('SELECT merchant_trade_no FROM orders WHERE id = ?').get(orderId).merchant_trade_no;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));

    const res = await request(app).get('/ecpay/payment/' + orderId);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/orders/${orderId}?payment=pending`);
    expect(db.prepare('SELECT merchant_trade_no FROM orders WHERE id = ?').get(orderId).merchant_trade_no).toBe(before);
  });
});
