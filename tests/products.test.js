const { app, request } = require('./setup');

describe('Products API', () => {
  let productId;

  it('should get product list', async () => {
    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body).toHaveProperty('message');
    expect(res.body.data).toHaveProperty('products');
    expect(res.body.data).toHaveProperty('pagination');
    expect(Array.isArray(res.body.data.products)).toBe(true);
    expect(res.body.data.products.length).toBeGreaterThan(0);

    productId = res.body.data.products[0].id;
  });

  it('should support pagination', async () => {
    const res = await request(app).get('/api/products?page=1&limit=2');

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.page).toBe(1);
    expect(res.body.data.pagination.limit).toBe(2);
    expect(res.body.data.products.length).toBeLessThanOrEqual(2);
  });

  it('should get product detail by id', async () => {
    const res = await request(app).get(`/api/products/${productId}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('id', productId);
    expect(res.body.data).toHaveProperty('name');
    expect(res.body.data).toHaveProperty('price');
    expect(res.body.data).toHaveProperty('stock');
  });

  it('should return 404 for non-existent product', async () => {
    const res = await request(app).get('/api/products/non-existent-id');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).not.toBeNull();
  });
});
