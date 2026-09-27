const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Move guest (session) cart rows to the user; duplicates are summed, all quantities capped at stock.
// session_id is cleared so the same browser can no longer reach these rows as a guest after logout.
const mergeGuestCart = db.transaction((sessionId, userId) => {
  const guestItems = db.prepare(
    `SELECT ci.id, ci.product_id, ci.quantity, p.stock
     FROM cart_items ci JOIN products p ON ci.product_id = p.id
     WHERE ci.session_id = ?`
  ).all(sessionId);

  for (const item of guestItems) {
    const existing = db.prepare(
      'SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ?'
    ).get(userId, item.product_id);
    const qty = Math.min((existing ? existing.quantity : 0) + item.quantity, item.stock);

    if (existing) {
      if (qty >= 1) db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(qty, existing.id);
      db.prepare('DELETE FROM cart_items WHERE id = ?').run(item.id);
    } else if (qty >= 1) {
      db.prepare('UPDATE cart_items SET user_id = ?, session_id = NULL, quantity = ? WHERE id = ?')
        .run(userId, qty, item.id);
    } else {
      // Sold out: quantity 0 would violate CHECK(quantity > 0)
      db.prepare('DELETE FROM cart_items WHERE id = ?').run(item.id);
    }
  }
});

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: 註冊新帳號
 *     tags: [Auth]
 *     parameters:
 *       - in: header
 *         name: X-Session-Id
 *         required: false
 *         description: 訪客購物車 session；帶入時將其購物車合併至此帳號
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, name]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: 註冊成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         email:
 *                           type: string
 *                         name:
 *                           type: string
 *                         role:
 *                           type: string
 *                     token:
 *                       type: string
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       400:
 *         description: 參數缺失或格式錯誤
 *       409:
 *         description: Email 已被註冊
 */
router.post('/register', (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: 'email、password、name 為必填欄位'
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: 'Email 格式不正確'
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: '密碼至少需要 6 個字元'
    });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({
      data: null,
      error: 'CONFLICT',
      message: 'Email 已被註冊'
    });
  }

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);

  // One transaction: a failed guest-cart merge must not leave a created account behind (retry would hit 409)
  db.transaction(() => {
    db.prepare(
      'INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)'
    ).run(id, email, passwordHash, name, 'user');

    if (req.sessionId) mergeGuestCart(req.sessionId, id);
  })();

  const user = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(id);

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.status(201).json({
    data: {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token
    },
    error: null,
    message: '註冊成功'
  });
});

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: 登入
 *     tags: [Auth]
 *     parameters:
 *       - in: header
 *         name: X-Session-Id
 *         required: false
 *         description: 訪客購物車 session；帶入時將其購物車合併至此帳號
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: 登入成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         email:
 *                           type: string
 *                         name:
 *                           type: string
 *                         role:
 *                           type: string
 *                     token:
 *                       type: string
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       400:
 *         description: 參數缺失
 *       401:
 *         description: Email 或密碼錯誤
 */
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: 'email 和 password 為必填欄位'
    });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.status(401).json({
      data: null,
      error: 'UNAUTHORIZED',
      message: 'Email 或密碼錯誤'
    });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({
      data: null,
      error: 'UNAUTHORIZED',
      message: 'Email 或密碼錯誤'
    });
  }

  if (req.sessionId) mergeGuestCart(req.sessionId, user.id);

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    data: {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token
    },
    error: null,
    message: '登入成功'
  });
});

/**
 * @openapi
 * /api/auth/profile:
 *   get:
 *     summary: 取得個人資料
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
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
 *                     email:
 *                       type: string
 *                     name:
 *                       type: string
 *                     role:
 *                       type: string
 *                     created_at:
 *                       type: string
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       401:
 *         description: 未登入或 token 無效
 */
router.get('/profile', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(req.user.userId);

  if (!user) {
    return res.status(404).json({
      data: null,
      error: 'NOT_FOUND',
      message: '使用者不存在'
    });
  }

  res.json({
    data: user,
    error: null,
    message: '成功'
  });
});

module.exports = router;
