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
