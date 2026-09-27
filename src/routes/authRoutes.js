const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: 註冊新帳號
 *     tags: [Auth]
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

  db.prepare(
    'INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)'
  ).run(id, email, passwordHash, name, 'user');

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
