const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

const router = express.Router();

// All admin product routes require auth + admin
router.use(authMiddleware, adminMiddleware);

/**
 * @openapi
 * /api/admin/products:
 *   get:
 *     summary: 後台商品列表
 *     tags: [Admin Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     products:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           description:
 *                             type: string
 *                           price:
 *                             type: integer
 *                           stock:
 *                             type: integer
 *                           image_url:
 *                             type: string
 *                           created_at:
 *                             type: string
 *                           updated_at:
 *                             type: string
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       401:
 *         description: 未登入
 *       403:
 *         description: 權限不足
 */
router.get('/', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 10));
  const offset = (page - 1) * limit;

  const total = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  const products = db.prepare('SELECT * FROM products ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);

  res.json({
    data: {
      products,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    },
    error: null,
    message: '成功'
  });
});

/**
 * @openapi
 * /api/admin/products:
 *   post:
 *     summary: 新增商品
 *     tags: [Admin Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, price, stock]
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: integer
 *                 minimum: 1
 *               stock:
 *                 type: integer
 *                 minimum: 0
 *               image_url:
 *                 type: string
 *     responses:
 *       201:
 *         description: 商品新增成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     price:
 *                       type: integer
 *                     stock:
 *                       type: integer
 *                     image_url:
 *                       type: string
 *                     created_at:
 *                       type: string
 *                     updated_at:
 *                       type: string
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       400:
 *         description: 參數錯誤
 */
router.post('/', (req, res) => {
  const { name, description, price, stock, image_url } = req.body;

  if (!name) {
    return res.status(400).json({ data: null, error: 'VALIDATION_ERROR', message: 'name 為必填欄位' });
  }
  if (price === undefined || price === null || !Number.isInteger(price) || price <= 0) {
    return res.status(400).json({ data: null, error: 'VALIDATION_ERROR', message: 'price 必須為正整數' });
  }
  if (stock === undefined || stock === null || !Number.isInteger(stock) || stock < 0) {
    return res.status(400).json({ data: null, error: 'VALIDATION_ERROR', message: 'stock 必須為非負整數' });
  }

  const id = uuidv4();
  db.prepare(
    'INSERT INTO products (id, name, description, price, stock, image_url) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, name, description || null, price, stock, image_url || null);

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);

  res.status(201).json({
    data: product,
    error: null,
    message: '商品新增成功'
  });
});

/**
 * @openapi
 * /api/admin/products/{id}:
 *   put:
 *     summary: 編輯商品
 *     tags: [Admin Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: integer
 *                 minimum: 1
 *               stock:
 *                 type: integer
 *                 minimum: 0
 *               image_url:
 *                 type: string
 *     responses:
 *       200:
 *         description: 商品更新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     price:
 *                       type: integer
 *                     stock:
 *                       type: integer
 *                     image_url:
 *                       type: string
 *                     created_at:
 *                       type: string
 *                     updated_at:
 *                       type: string
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       404:
 *         description: 商品不存在
 */
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);

  if (!existing) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '商品不存在' });
  }

  const { name, description, price, stock, image_url } = req.body;

  if (name !== undefined && name.trim() === '') {
    return res.status(400).json({ data: null, error: 'VALIDATION_ERROR', message: '商品名稱不能為空' });
  }
  if (price !== undefined && (!Number.isInteger(price) || price <= 0)) {
    return res.status(400).json({ data: null, error: 'VALIDATION_ERROR', message: 'price 必須為正整數' });
  }
  if (stock !== undefined && (!Number.isInteger(stock) || stock < 0)) {
    return res.status(400).json({ data: null, error: 'VALIDATION_ERROR', message: 'stock 必須為非負整數' });
  }

  const updated = {
    name: name !== undefined ? name : existing.name,
    description: description !== undefined ? description : existing.description,
    price: price !== undefined ? price : existing.price,
    stock: stock !== undefined ? stock : existing.stock,
    image_url: image_url !== undefined ? image_url : existing.image_url
  };

  db.prepare(
    `UPDATE products SET name = ?, description = ?, price = ?, stock = ?, image_url = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(updated.name, updated.description, updated.price, updated.stock, updated.image_url, id);

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);

  res.json({
    data: product,
    error: null,
    message: '商品更新成功'
  });
});

/**
 * @openapi
 * /api/admin/products/{id}:
 *   delete:
 *     summary: 刪除商品
 *     tags: [Admin Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 商品刪除成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   nullable: true
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       404:
 *         description: 商品不存在
 *       409:
 *         description: 商品存在未完成訂單，無法刪除
 */
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(id);

  if (!existing) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '商品不存在' });
  }

  // Check if product is in any pending orders
  const pendingOrderCount = db.prepare(
    `SELECT COUNT(*) as count FROM order_items oi
     JOIN orders o ON oi.order_id = o.id
     WHERE oi.product_id = ? AND o.status = 'pending'`
  ).get(id).count;

  if (pendingOrderCount > 0) {
    return res.status(409).json({
      data: null,
      error: 'CONFLICT',
      message: '此商品存在未完成的訂單，無法刪除'
    });
  }

  db.prepare('DELETE FROM products WHERE id = ?').run(id);

  res.json({
    data: null,
    error: null,
    message: '商品刪除成功'
  });
});

module.exports = router;
