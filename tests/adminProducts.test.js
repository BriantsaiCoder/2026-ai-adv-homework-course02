const { app, request, getAdminToken, registerUser } = require('./setup');

describe('Admin Products API', () => {
  let adminToken;
  let createdProductId;

  beforeAll(async () => {
    adminToken = await getAdminToken();
  });

  it('should get admin product list', async () => {
    const res = await request(app)
      .get('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body).toHaveProperty('message');
    expect(res.body.data).toHaveProperty('products');
    expect(res.body.data).toHaveProperty('pagination');
    expect(Array.isArray(res.body.data.products)).toBe(true);
  });

  it('should create a new product', async () => {
    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: '測試花卉商品',
        description: '這是一個測試商品',
        price: 500,
        stock: 100,
        image_url: 'https://images.unsplash.com/photo-test',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('name', '測試花卉商品');
    expect(res.body.data).toHaveProperty('price', 500);
    expect(res.body.data).toHaveProperty('stock', 100);

    createdProductId = res.body.data.id;
  });

  it('should update a product', async () => {
    const res = await request(app)
      .put(`/api/admin/products/${createdProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '更新後的花卉商品', price: 600 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('name', '更新後的花卉商品');
    expect(res.body.data).toHaveProperty('price', 600);
  });

  it('should delete a product', async () => {
    const res = await request(app)
      .delete(`/api/admin/products/${createdProductId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('error', null);

    // Verify product is gone
    const getRes = await request(app).get(`/api/products/${createdProductId}`);
    expect(getRes.status).toBe(404);
  });

  it('should deny access to regular user', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get('/api/admin/products')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).not.toBeNull();
  });

  it('should deny access without token', async () => {
    const res = await request(app).get('/api/admin/products');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).not.toBeNull();
  });
});
