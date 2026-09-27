async function apiFetch(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...Auth.getAuthHeaders(),
    ...options.headers
  };

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem(Auth.TOKEN_KEY);
    localStorage.removeItem(Auth.USER_KEY);
    window.location.href = '/login';
    return;
  }

  const data = await res.json();

  if (!res.ok) {
    throw { status: res.status, data };
  }

  return data;
}

// Seed images are Unsplash URLs sized w=400; request a width that fits the slot.
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1490750967868-88aa4f44baee?w=400';
function sizedImage(url, width) {
  const src = url || FALLBACK_IMAGE;
  return src.includes('images.unsplash.com') ? src.replace(/([?&])w=\d+/, '$1w=' + width) : src;
}

function refreshCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  apiFetch('/api/cart').then(function (res) {
    const count = res && res.data && res.data.items ? res.data.items.length : 0;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }).catch(function () {});
}

async function addProductToCart(productId, quantity) {
  try {
    await apiFetch('/api/cart', {
      method: 'POST',
      body: JSON.stringify({ productId, quantity })
    });
    Notification.show('已加入購物車', 'success');
    refreshCartBadge();
  } catch (e) {
    Notification.show(e?.data?.message || '加入購物車失敗', 'error');
  }
}
