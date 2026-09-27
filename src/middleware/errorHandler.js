const SAFE_MESSAGES = {
  400: '請求格式錯誤',
  401: '未授權的請求',
  403: '禁止存取',
  404: '找不到該資源',
  409: '資源衝突',
  422: '無法處理的請求',
  429: '請求過於頻繁'
};

function errorHandler(err, req, res, _next) {
  console.error('Unhandled error:', err.message);

  const statusCode = err.status || err.statusCode || 500;

  // Use safe messages to avoid leaking internal details
  const message = statusCode === 500
    ? '伺服器內部錯誤'
    : (err.isOperational ? err.message : (SAFE_MESSAGES[statusCode] || '請求處理失敗'));

  res.status(statusCode).json({
    data: null,
    error: 'INTERNAL_ERROR',
    message
  });
}

module.exports = errorHandler;
