const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const orders = ref([]);
    const loading = ref(true);

    const statusMap = {
      pending: { label: '待付款', cls: 'bg-apricot-bg text-apricot-ink' },
      paid: { label: '已付款', cls: 'bg-sage-bg text-sage-ink' },
      failed: { label: '付款失敗', cls: 'bg-error-bg text-error' },
      unknown: { label: '處理中', cls: 'bg-line text-ink-2' },
    };

    // SQLite datetime('now') is UTC without a zone suffix.
    function formatDate(value) {
      return new Date(value.replace(' ', 'T') + 'Z').toLocaleDateString('zh-TW');
    }

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/orders');
        orders.value = res.data.orders;
      } catch (e) {
        orders.value = [];
      } finally {
        loading.value = false;
      }
    });

    return { orders, loading, statusMap, formatDate };
  }
}).mount('#app');
