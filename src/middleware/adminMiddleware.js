function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      data: null,
      error: 'FORBIDDEN',
      message: '權限不足'
    });
  }
  next();
}

module.exports = adminMiddleware;
