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

// 回傳 AIO 表單的 action 與欄位，由前端建立表單送出至綠界
function buildAioFormParams(order, items, config) {
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

  return { action: cfg.aioCheckOutUrl, fields: params };
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
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`ECPay QueryTradeInfo HTTP ${response.status}`);
  }

  const responseText = await response.text();
  // 回應值未經 URL 編碼（中文、空白、+、% 原樣回傳；& 與 = 由綠界轉為空白），URLSearchParams 會誤解 + 與 %XX
  const result = Object.fromEntries(responseText.split('&').map((pair) => {
    const [key, ...value] = pair.split('=');
    return [key, value.join('=')];
  }));
  // 回應未通過簽章驗證（含缺少 CheckMacValue）即不可信任 TradeStatus
  if (!verifyCheckMacValue(result, cfg.hashKey, cfg.hashIV)) {
    throw new Error('ECPay QueryTradeInfo CheckMacValue 驗證失敗');
  }
  // 簽章只證明出自綠界；結果須對應本次查詢的編號，防止挪用他筆交易的真實回應（已付款或未付款皆會影響換號與扣款判斷）
  if (result.MerchantTradeNo !== merchantTradeNo) {
    throw new Error('ECPay QueryTradeInfo MerchantTradeNo 不符');
  }
  return result;
}

// 由新到舊查詢訂單曾發出的每個 MerchantTradeNo（目前序號…01，最後是原始編號），遇到已付款即停：
// 較早的嘗試可能在換號後才完成付款（如 ATM／超商代碼），只查最新編號會漏記
// ponytail: 查詢次數隨嘗試次數線性成長；嘗試次數變多時改為記錄實際送出的編號或接 ReturnURL 通知
async function queryIssuedTrades(order, config) {
  const base = order.order_no.replace(/-/g, '');
  const current = order.merchant_trade_no || base;
  const results = [];
  for (let n = Number(current.slice(base.length)); n >= 0; n--) {
    const result = await queryTradeInfo(n ? base + String(n).padStart(2, '0') : base, config);
    results.push(result);
    if (result.TradeStatus === '1') break;
  }
  return results;
}

module.exports = {
  ECPAY_CONFIG,
  ecpayUrlEncode,
  generateCheckMacValue,
  verifyCheckMacValue,
  getMerchantTradeDate,
  buildAioFormParams,
  queryTradeInfo,
  queryIssuedTrades,
};
