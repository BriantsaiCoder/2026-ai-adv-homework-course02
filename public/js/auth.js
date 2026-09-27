const Auth = {
  TOKEN_KEY: 'flower_token',
  USER_KEY: 'flower_user',
  SESSION_KEY: 'flower_session_id',

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  getUser() {
    const u = localStorage.getItem(this.USER_KEY);
    return u ? JSON.parse(u) : null;
  },

  isLoggedIn() {
    return !!this.getToken();
  },

  isAdmin() {
    return this.getUser()?.role === 'admin';
  },

  login(token, user) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },

  logout() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    window.location.href = '/';
  },

  getSessionId() {
    let sid = localStorage.getItem(this.SESSION_KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem(this.SESSION_KEY, sid);
    }
    return sid;
  },

  getAuthHeaders() {
    const headers = {};
    const token = this.getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    headers['X-Session-Id'] = this.getSessionId();
    return headers;
  },

  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
      return false;
    }
    return true;
  },

  requireAdmin() {
    if (!this.isLoggedIn() || !this.isAdmin()) {
      window.location.href = '/login';
      return false;
    }
    return true;
  }
};
