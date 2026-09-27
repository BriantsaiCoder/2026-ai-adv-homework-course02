const { createApp, ref, computed, onMounted } = Vue;

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const el = document.getElementById('app');
    const orderId = el.dataset.orderId;
    // ECPay ClientBackURL returns with ?payment=pending; after the auto check it becomes success or unpaid.
    const paymentResult = ref(el.dataset.paymentResult || null);

    const order = ref(null);
    const loading = ref(true);
    const paying = ref(false);

    const statusMap = {
      pending: { label: '待付款', cls: 'bg-apricot-bg text-apricot-ink' },
      paid: { label: '已付款', cls: 'bg-sage-bg text-sage-ink' },
      failed: { label: '付款失敗', cls: 'bg-error-bg text-error' },
    };

    const status = computed(function () {
      return statusMap[order.value.status] || { label: order.value.status, cls: 'bg-line text-ink-2' };
    });

    const view = computed(function () {
      if (order.value.status === 'paid') return 'complete';
      if (order.value.status === 'failed' || ['unpaid', 'failed', 'cancel'].includes(paymentResult.value)) return 'failed';
      return 'confirm';
    });

    const stepCurrent = computed(function () {
      return view.value === 'complete' ? 5 : 3;
    });

    const justPaid = computed(function () { return paymentResult.value === 'success'; });

    const subtotal = computed(function () {
      return order.value.items.reduce(function (sum, item) {
        return sum + item.product_price * item.quantity;
      }, 0);
    });
    const shipping = computed(function () { return order.value.total_amount - subtotal.value; });

    const createdDate = computed(function () {
      return new Date(order.value.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('zh-TW');
    });

    async function checkPayment(fromReturn) {
      if (!order.value || paying.value) return;
      paying.value = true;
      try {
        const res = await apiFetch('/api/orders/' + order.value.id + '/check-payment', {
          method: 'POST'
        });
        order.value = res.data;
        if (res.data.status === 'paid') {
          paymentResult.value = 'success';
        } else if (fromReturn === true) {
          paymentResult.value = 'unpaid';
        } else {
          Notification.show(res.message || '尚未完成付款，請稍後再查詢', 'info');
        }
      } catch (e) {
        Notification.show(e?.data?.message || '查詢付款狀態失敗', 'error');
      } finally {
        paying.value = false;
      }
    }

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/orders/' + orderId);
        order.value = res.data;

        if (paymentResult.value === 'pending' && order.value.status === 'pending') {
          await checkPayment(true);
        }
      } catch (e) {
        Notification.show('載入訂單失敗', 'error');
      } finally {
        loading.value = false;
      }
    });

    return {
      order, loading, paying, status, view, stepCurrent, justPaid,
      subtotal, shipping, createdDate, checkPayment
    };
  }
}).mount('#app');
