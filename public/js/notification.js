const Notification = {
  _timeout: null,

  show(message, type = 'info') {
    const el = document.getElementById('notification-toast');
    if (!el) return;

    const colors = {
      success: 'bg-stem text-white',
      error: 'bg-error text-white',
      warning: 'bg-apricot-ink text-white',
      info: 'bg-ink-2 text-white'
    };

    el.className = 'fixed top-28 right-4 left-4 md:left-auto z-[100] px-5 py-3 rounded-md shadow-lg text-sm transition-all duration-300 ' + (colors[type] || colors.info);
    el.textContent = message;
    el.style.display = 'block';
    el.style.opacity = '1';

    if (this._timeout) clearTimeout(this._timeout);
    this._timeout = setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => { el.style.display = 'none'; }, 300);
    }, 3000);
  }
};
