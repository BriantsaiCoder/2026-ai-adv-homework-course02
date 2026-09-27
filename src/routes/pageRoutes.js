const express = require('express');
const db = require('../database');
const { buildAioFormHtml, queryTradeInfo } = require('../utils/ecpay');
const router = express.Router();

// Helper to render with front layout
function renderFront(res, page, locals = {}) {
  res.render('pages/' + page, { layout: 'front', ...locals }, function (err, body) {
    if (err) return res.status(500).send(err.message);
    res.render('layouts/front', { body, ...locals });
  });
}

// Helper to render with admin layout
function renderAdmin(res, page, locals = {}) {
  res.render('pages/admin/' + page, locals, function (err, body) {
    if (err) return res.status(500).send(err.message);
    res.render('layouts/admin', { body, ...locals });
  });
}

// Front pages
router.get('/', function (req, res) {
  renderFront(res, 'index', { title: '首頁', pageScript: 'index' });
});

router.get('/products/:id', function (req, res) {
  renderFront(res, 'product-detail', {
    title: '商品詳情',
    pageScript: 'product-detail',
    productId: req.params.id
  });
});

router.get('/cart', function (req, res) {
  renderFront(res, 'cart', { title: '購物車', pageScript: 'cart' });
});

router.get('/checkout', function (req, res) {
  renderFront(res, 'checkout', { title: '結帳', pageScript: 'checkout' });
});

router.get('/login', function (req, res) {
  renderFront(res, 'login', { title: '登入', pageScript: 'login' });
});

router.get('/orders', function (req, res) {
  renderFront(res, 'orders', { title: '我的訂單', pageScript: 'orders' });
});

router.get('/orders/:id', function (req, res) {
  renderFront(res, 'order-detail', {
    title: '訂單詳情',
    pageScript: 'order-detail',
    orderId: req.params.id,
    paymentResult: req.query.payment || ''
  });
});

// ECPay payment form page
// 綠界拒收重複的 MerchantTradeNo（10300028），每次付款嘗試改用 order_no 去連字號 + 遞增序號
router.get('/ecpay/payment/:orderId', async function (req, res, next) {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.orderId);
    if (!order) {
      return res.status(404).send('訂單不存在');
    }
    if (order.status !== 'pending') {
      return res.redirect('/orders/' + order.id);
    }

    const baseTradeNo = order.order_no.replace(/-/g, '');
    const prevTradeNo = order.merchant_trade_no || baseTradeNo;

    // 換號前確認目前編號未付款，避免依序重試時對已付款訂單重複扣款（從未送出的編號回 10200047，照常換號）
    const result = await queryTradeInfo(prevTradeNo).catch((err) => {
      console.error('[ECPay] QueryTradeInfo error:', err.message);
      return null;
    });
    if (!result) {
      return res.redirect('/orders/' + order.id + '?payment=pending');
    }
    if (result.TradeStatus === '1') {
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('paid', order.id);
      return res.redirect('/orders/' + order.id);
    }

    const tradeNo = baseTradeNo + String(Number(prevTradeNo.slice(baseTradeNo.length)) + 1).padStart(2, '0');
    if (tradeNo.length > 20) {
      return res.status(400).send('付款嘗試次數已達上限');
    }
    db.prepare('UPDATE orders SET merchant_trade_no = ? WHERE id = ?').run(tradeNo, order.id);

    const items = db.prepare('SELECT product_name, product_price, quantity FROM order_items WHERE order_id = ?').all(order.id);
    const html = buildAioFormHtml({ ...order, merchant_trade_no: tradeNo }, items);
    // 瀏覽器從綠界按上一頁時重新 GET 換號，而非重播快取中的自動送出表單
    res.set('Cache-Control', 'no-store');
    res.type('text/html').send(html);
  } catch (err) {
    next(err);
  }
});

// Admin pages
router.get('/admin/products', function (req, res) {
  renderAdmin(res, 'products', {
    title: '商品管理',
    pageScript: 'admin-products',
    currentPath: '/admin/products'
  });
});

router.get('/admin/orders', function (req, res) {
  renderAdmin(res, 'orders', {
    title: '訂單管理',
    pageScript: 'admin-orders',
    currentPath: '/admin/orders'
  });
});

module.exports = router;
