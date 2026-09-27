const { app, request, getAdminToken, registerUser } = require('./setup');

const orderBody = {
  recipientName: '測試收件人',
  recipientEmail: 'recipient@example.com',
  recipientAddress: '台北市測試路 123 號',
};

async function orderWith(token, productId, quantity) {
  await request(app)
    .post('/api/cart')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId, quantity });
  return request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send(orderBody);
}

describe('Orders API - shipping fee', () => {
  let userToken;
  let adminToken;
  let cheapProductId;
  const orderIds = [];

  beforeAll(async () => {
    ({ token: userToken } = await registerUser());
    adminToken = await getAdminToken();
    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '運費測試商品', price: 300, stock: 10 });
    cheapProductId = res.body.data.id;
  });

  afterAll(async () => {
    for (const id of orderIds) {
      await request(app)
        .patch(`/api/orders/${id}/pay`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ action: 'success' });
    }
    await request(app)
      .delete(`/api/admin/products/${cheapProductId}`)
      .set('Authorization', `Bearer ${adminToken}`);
  });

  it('should add NT$ 150 shipping when subtotal is under NT$ 500', async () => {
    const res = await orderWith(userToken, cheapProductId, 1);

    expect(res.status).toBe(201);
    orderIds.push(res.body.data.id);
    expect(res.body.data.total_amount).toBe(300 + 150);
  });

  it('should waive shipping when subtotal reaches NT$ 500', async () => {
    const res = await orderWith(userToken, cheapProductId, 2);

    expect(res.status).toBe(201);
    orderIds.push(res.body.data.id);
    expect(res.body.data.total_amount).toBe(600);
  });
});

describe('Orders API', () => {
  let userToken;
  let productId;
  let orderId;

  beforeAll(async () => {
    // Register a user for order tests
    const { token } = await registerUser();
    userToken = token;

    // Get a product id
    const prodRes = await request(app).get('/api/products');
    productId = prodRes.body.data.products[0].id;

    // Add product to cart
    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ productId, quantity: 1 });
  });

  it('should create an order from cart', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body).toHaveProperty('message');
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('order_no');
    expect(res.body.data).toHaveProperty('total_amount');
    expect(res.body.data).toHaveProperty('status', 'pending');
    expect(res.body.data).toHaveProperty('items');
    expect(Array.isArray(res.body.data.items)).toBe(true);

    orderId = res.body.data.id;
  });

  it('should fail to create order with empty cart', async () => {
    // The cart was already cleared by the previous order
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error');
  });

  it('should fail to create order without auth', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
      });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).not.toBeNull();
  });

  it('should get order list', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('orders');
    expect(Array.isArray(res.body.data.orders)).toBe(true);
    expect(res.body.data.orders.length).toBeGreaterThan(0);
  });

  it('should get order detail', async () => {
    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('id', orderId);
    expect(res.body.data).toHaveProperty('order_no');
    expect(res.body.data).toHaveProperty('items');
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('should return 404 for non-existent order', async () => {
    const res = await request(app)
      .get('/api/orders/non-existent-order-id')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error');
  });
});
