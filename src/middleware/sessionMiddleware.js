function sessionMiddleware(req, res, next) {
  const sessionId = req.headers['x-session-id'];
  if (sessionId) {
    req.sessionId = sessionId;
  }
  next();
}

module.exports = sessionMiddleware;
