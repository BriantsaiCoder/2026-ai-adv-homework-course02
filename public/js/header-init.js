document.addEventListener('DOMContentLoaded', function () {
  const authNav = document.getElementById('auth-nav');
  const authNavMobile = document.getElementById('auth-nav-mobile');
  const userIcon = '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>';

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  const loggedIn = Auth.isLoggedIn();
  const user = Auth.getUser();
  const name = escapeHtml(user?.name || '');
  const adminLink = Auth.isAdmin() ? '<a href="/admin/products" class="text-rose hover:text-rose-deep">後台管理</a>' : '';

  if (authNav) {
    authNav.innerHTML = loggedIn
      ? adminLink + userIcon + '<span>' + name + '</span><button onclick="Auth.logout()" class="text-sm text-ink-3 hover:text-rose transition-colors">登出</button>'
      : '<a href="/login" class="flex items-center gap-2 hover:text-rose transition-colors">' + userIcon + '<span>登入</span></a>';
  }

  if (authNavMobile) {
    const item = 'px-3 py-2.5 rounded hover:bg-tissue text-left';
    authNavMobile.innerHTML = loggedIn
      ? '<span class="px-3 py-2.5 text-ink-2">' + name + '</span>' +
        (Auth.isAdmin() ? '<a href="/admin/products" class="' + item + '">後台管理</a>' : '') +
        '<button onclick="Auth.logout()" class="' + item + '">登出</button>'
      : '<a href="/login" class="' + item + '">登入／註冊</a>';
  }

  document.querySelectorAll('[data-orders-link]').forEach(function (el) {
    el.style.display = loggedIn ? '' : 'none';
  });

  refreshCartBadge();
});
