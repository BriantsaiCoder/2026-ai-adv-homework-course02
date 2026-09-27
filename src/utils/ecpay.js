const crypto = require('crypto');

const ECPAY_CONFIG = {
  merchantId: process.env.ECPAY_MERCHANT_ID || '3002607',
  hashKey: process.env.ECPAY_HASH_KEY || 'pwFHCqoQZGmho4w6',
  hashIV: process.env.ECPAY_HASH_IV || 'EkRm7iFT261dpevs',
  isStaging: (process.env.ECPAY_ENV || 'staging') !== 'production',
};

ECPAY_CONFIG.baseUrl = ECPAY_CONFIG.isStaging
  ? 'https://payment-stage.ecpay.com.tw'
  : 'https://payment.ecpay.com.tw';

ECPAY_CONFIG.aioCheckOutUrl = ECPAY_CONFIG.baseUrl + '/Cashier/AioCheckOut/V5';
ECPAY_CONFIG.queryTradeInfoUrl = ECPAY_CONFIG.baseUrl + '/Cashier/QueryTradeInfo/V5';

function ecpayUrlEncode(str) {
  let encoded = encodeURIComponent(str)
    .replace(/%20/g, '+')
    .replace(/~/g, '%7e')
    .replace(/'/g, '%27');

  encoded = encoded.toLowerCase();

  const replacements = {
    '%2d': '-',
    '%5f': '_',
    '%2e': '.',
    '%21': '!',
    '%2a': '*',
    '%28': '(',
    '%29': ')',
  };

  for (const [old, char] of Object.entries(replacements)) {
    encoded = encoded.split(old).join(char);
  }

  return encoded;
}

function generateCheckMacValue(params, hashKey, hashIV) {
  const filtered = Object.entries(params)
    .filter(([k]) => k !== 'CheckMacValue');

  const sorted = filtered.sort((a, b) =>
    a[0].toLowerCase().localeCompare(b[0].toLowerCase())
  );

  const paramStr = sorted.map(([k, v]) => `${k}=${v}`).join('&');
  const raw = `HashKey=${hashKey}&${paramStr}&HashIV=${hashIV}`;
  const encoded = ecpayUrlEncode(raw);

  return crypto.createHash('sha256').update(encoded, 'utf8').digest('hex').toUpperCase();
}

function verifyCheckMacValue(params, hashKey, hashIV) {
  const received = params.CheckMacValue || '';
  const calculated = generateCheckMacValue(params, hashKey, hashIV);

  const a = Buffer.from(calculated);
  const b = Buffer.from(received);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function getMerchantTradeDate() {
  return new Date()
    .toLocaleString('sv-SE', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    .replace(/-/g, '/');
}

function buildItemName(items) {
  const name = items
    .map((item) => `${item.product_name} x${item.quantity}`)
    .join('#');

  if (Buffer.byteLength(name, 'utf8') > 400) {
    let truncated = '';
    for (const item of items) {
      const part = `${item.product_name} x${item.quantity}`;
      const next = truncated ? truncated + '#' + part : part;
      if (Buffer.byteLength(next, 'utf8') > 390) {
        return truncated + '#...';
      }
      truncated = next;
    }
    return truncated;
  }
  return name;
}

function buildAioFormHtml(order, items, config) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
  const cfg = config || ECPAY_CONFIG;

  const params = {
    MerchantID: cfg.merchantId,
    MerchantTradeNo: order.merchant_trade_no,
    MerchantTradeDate: getMerchantTradeDate(),
    PaymentType: 'aio',
    TotalAmount: String(order.total_amount),
    TradeDesc: encodeURIComponent('花卉電商訂單'),
    ItemName: buildItemName(items),
    ReturnURL: baseUrl + '/ecpay/notify',
    ClientBackURL: baseUrl + '/orders/' + order.id + '?payment=pending',
    ChoosePayment: 'ALL',
    EncryptType: '1',
  };

  params.CheckMacValue = generateCheckMacValue(params, cfg.hashKey, cfg.hashIV);

  const fields = Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${escapeHtml(String(v))}">`)
    .join('\n    ');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>正在前往綠界付款...</title></head>
<body>
  <p style="text-align:center;margin-top:50px;font-family:sans-serif;">正在導向綠界付款頁面，請稍候...</p>
  <form id="ecpay-form" method="post" action="${cfg.aioCheckOutUrl}">
    ${fields}
  </form>
  <script>document.getElementById("ecpay-form").submit();</script>
</body>
</html>`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function queryTradeInfo(merchantTradeNo, config) {
  const cfg = config || ECPAY_CONFIG;

  const params = {
    MerchantID: cfg.merchantId,
    MerchantTradeNo: merchantTradeNo,
    TimeStamp: String(Math.floor(Date.now() / 1000)),
  };

  params.CheckMacValue = generateCheckMacValue(params, cfg.hashKey, cfg.hashIV);

  const body = new URLSearchParams(params).toString();

  const response = await fetch(cfg.queryTradeInfoUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    throw new Error(`ECPay QueryTradeInfo HTTP ${response.status}`);
  }

  const responseText = await response.text();
  const result = Object.fromEntries(new URLSearchParams(responseText));
  return result;
}

module.exports = {
  ECPAY_CONFIG,
  ecpayUrlEncode,
  generateCheckMacValue,
  verifyCheckMacValue,
  getMerchantTradeDate,
  buildAioFormHtml,
  queryTradeInfo,
};
