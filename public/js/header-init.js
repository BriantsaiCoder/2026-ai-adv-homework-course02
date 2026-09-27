document.addEventListener('DOMContentLoaded', function () {
  const authNav = document.getElementById('auth-nav');
  const cartBadge = document.getElementById('cart-badge');
  const ordersLink = document.getElementById('orders-link');

  if (authNav) {
    if (Auth.isLoggedIn()) {
      const user = Auth.getUser();
      let html = '';
      if (Auth.isAdmin()) {
        html += '<a href="/admin/products" class="text-rose-primary hover:text-rose-dark">後台管理</a>';
      }
      html += '<span class="text-text-secondary">' + (user?.name || '') + '</span>';
      html += '<button onclick="Auth.logout()" class="text-text-muted hover:text-rose-primary transition-colors">登出</button>';
      authNav.innerHTML = html;
    } else {
      authNav.innerHTML = '<a href="/login" class="bg-rose-primary text-white px-4 py-1.5 rounded-full hover:bg-rose-dark transition-colors">登入</a>';
    }
  }

  if (ordersLink) {
    ordersLink.style.display = Auth.isLoggedIn() ? '' : 'none';
  }

  if (cartBadge) {
    apiFetch('/api/cart').then(function (res) {
      if (res && res.data && res.data.items && res.data.items.length > 0) {
        cartBadge.textContent = res.data.items.length;
        cartBadge.style.display = 'flex';
      }
    }).catch(function () {});
  }
});
