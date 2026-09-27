const { app, request, registerUser } = require('./setup');

describe('Cart API', () => {
  const sessionId = 'test-session-' + Date.now();
  let productId;
  let cartItemId;
  let userToken;

  beforeAll(async () => {
    // Get a product id from the product list
    const res = await request(app).get('/api/products');
    productId = res.body.data.products[0].id;
  });

  it('should add product to cart (guest mode)', async () => {
    const res = await request(app)
      .post('/api/cart')
      .set('X-Session-Id', sessionId)
      .send({ productId, quantity: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body).toHaveProperty('message');
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('product_id', productId);
    expect(res.body.data).toHaveProperty('quantity');

    cartItemId = res.body.data.id;
  });

  it('should get cart (guest mode)', async () => {
    const res = await request(app)
      .get('/api/cart')
      .set('X-Session-Id', sessionId);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('items');
    expect(res.body.data).toHaveProperty('total');
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThan(0);
  });

  it('should update cart item quantity (guest mode)', async () => {
    const res = await request(app)
      .patch(`/api/cart/${cartItemId}`)
      .set('X-Session-Id', sessionId)
      .send({ quantity: 3 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('quantity', 3);
  });

  it('should remove cart item (guest mode)', async () => {
    const res = await request(app)
      .delete(`/api/cart/${cartItemId}`)
      .set('X-Session-Id', sessionId);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('error', null);

    // Verify cart is empty
    const cartRes = await request(app)
      .get('/api/cart')
      .set('X-Session-Id', sessionId);
    expect(cartRes.body.data.items.length).toBe(0);
  });

  it('should add product to cart (authenticated mode)', async () => {
    const { token } = await registerUser();
    userToken = token;

    const res = await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ productId, quantity: 2 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('product_id', productId);
  });

  it('should merge guest cart into user cart on register', async () => {
    const guestSession = 'merge-register-' + Date.now();
    await request(app)
      .post('/api/cart')
      .set('X-Session-Id', guestSession)
      .send({ productId, quantity: 2 });

    const regRes = await request(app)
      .post('/api/auth/register')
      .set('X-Session-Id', guestSession)
      .send({ email: `merge-${Date.now()}@example.com`, password: 'password123', name: '合併測試' });
    expect(regRes.status).toBe(201);

    const userCart = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${regRes.body.data.token}`);
    expect(userCart.body.data.items).toEqual([
      expect.objectContaining({ product_id: productId, quantity: 2 })
    ]);

    const guestCart = await request(app)
      .get('/api/cart')
      .set('X-Session-Id', guestSession);
    expect(guestCart.body.data.items.length).toBe(0);
  });

  it('should sum duplicate items capped at stock when merging on login', async () => {
    const { token, user } = await registerUser();
    const guestSession = 'merge-login-' + Date.now();
    const { stock } = (await request(app).get(`/api/products/${productId}`)).body.data;

    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity: 1 });
    await request(app)
      .post('/api/cart')
      .set('X-Session-Id', guestSession)
      .send({ productId, quantity: stock });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('X-Session-Id', guestSession)
      .send({ email: user.email, password: 'password123' });
    expect(loginRes.status).toBe(200);

    const userCart = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${loginRes.body.data.token}`);
    expect(userCart.body.data.items).toEqual([
      expect.objectContaining({ product_id: productId, quantity: stock })
    ]);
  });

  it('should fail to add non-existent product to cart', async () => {
    const res = await request(app)
      .post('/api/cart')
      .set('X-Session-Id', sessionId)
      .send({ productId: 'non-existent-product-id', quantity: 1 });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).not.toBeNull();
  });
});
