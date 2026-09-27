require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const sessionMiddleware = require('./src/middleware/sessionMiddleware');
const errorHandler = require('./src/middleware/errorHandler');

// Initialize database (creates tables + seed data)
require('./src/database');

const app = express();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Global middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001'
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(sessionMiddleware);

// API Routes
app.use('/api/auth', require('./src/routes/authRoutes'));
app.use('/api/admin/products', require('./src/routes/adminProductRoutes'));
app.use('/api/admin/orders', require('./src/routes/adminOrderRoutes'));
app.use('/api/products', require('./src/routes/productRoutes'));
app.use('/api/cart', require('./src/routes/cartRoutes'));
app.use('/api/orders', require('./src/routes/orderRoutes'));

// Page Routes
app.use('/', require('./src/routes/pageRoutes'));

// 404 handler
app.use(function (req, res) {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({
      data: null,
      error: 'NOT_FOUND',
      message: '找不到該路徑'
    });
  }
  res.status(404).render('pages/404', {}, function (err, body) {
    if (err) return res.status(500).send(err.message);
    res.render('layouts/front', { body, title: '找不到頁面', pageScript: '' });
  });
});

// Error handler
app.use(errorHandler);

module.exports = app;
