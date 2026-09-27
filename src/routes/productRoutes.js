const express = require('express');
const db = require('../database');

const router = express.Router();

/**
 * @openapi
 * /api/products:
 *   get:
 *     summary: 取得商品列表
 *     tags: [Products]
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
 * /api/products/{id}:
 *   get:
 *     summary: 取得商品詳情
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
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
router.get('/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);

  if (!product) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '商品不存在' });
  }

  res.json({
    data: product,
    error: null,
    message: '成功'
  });
});

module.exports = router;
