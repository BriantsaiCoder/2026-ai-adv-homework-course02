const jwt = require('jsonwebtoken');
const db = require('../database');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      data: null,
      error: 'UNAUTHORIZED',
      message: '請先登入'
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(decoded.userId);
    if (!user) {
      return res.status(401).json({
        data: null,
        error: 'UNAUTHORIZED',
        message: '使用者不存在，請重新登入'
      });
    }

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role
    };
    next();
  } catch (err) {
    return res.status(401).json({
      data: null,
      error: 'UNAUTHORIZED',
      message: 'Token 無效或已過期'
    });
  }
}

module.exports = authMiddleware;
