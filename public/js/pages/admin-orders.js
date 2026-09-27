const { createApp, ref, watch, onMounted } = Vue;

createApp({
  setup() {
    const orders = ref([]);
    const pagination = ref({ total: 0, page: 1, limit: 10, totalPages: 0 });
    const loading = ref(true);
    const statusFilter = ref('');

    const detailVisible = ref(false);
    const detailOrder = ref(null);
    const detailLoading = ref(false);

    const statusMap = {
      pending: { label: '待付款', cls: 'bg-yellow-100 text-yellow-800' },
      paid: { label: '已付款', cls: 'bg-green-100 text-green-800' },
      failed: { label: '付款失敗', cls: 'bg-red-100 text-red-800' },
    };

    async function loadOrders(page) {
      page = page || 1;
      loading.value = true;
      try {
        var url = '/api/admin/orders?page=' + page + '&limit=10';
        if (statusFilter.value) url += '&status=' + statusFilter.value;
        const res = await apiFetch(url);
        orders.value = res.data.orders;
        pagination.value = res.data.pagination;
      } catch (e) {
        Notification.show('載入訂單失敗', 'error');
      } finally {
        loading.value = false;
      }
    }

    async function viewDetail(id) {
      detailVisible.value = true;
      detailLoading.value = true;
      try {
        const res = await apiFetch('/api/admin/orders/' + id);
        detailOrder.value = res.data;
      } catch (e) {
        Notification.show('載入訂單詳情失敗', 'error');
        detailVisible.value = false;
      } finally {
        detailLoading.value = false;
      }
    }

    watch(statusFilter, function () {
      loadOrders(1);
    });

    onMounted(function () {
      loadOrders();
    });

    return {
      orders, pagination, loading, statusFilter,
      detailVisible, detailOrder, detailLoading,
      statusMap, loadOrders, viewDetail
    };
  }
}).mount('#app');
