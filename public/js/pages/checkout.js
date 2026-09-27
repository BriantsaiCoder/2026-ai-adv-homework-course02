const { createApp, ref, computed, onMounted } = Vue;

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const loading = ref(true);
    const submitting = ref(false);
    const cartItems = ref([]);
    const form = ref({ recipientName: '', recipientEmail: '', recipientAddress: '' });
    const errors = ref({});

    const cartTotal = computed(function () {
      return cartItems.value.reduce(function (sum, item) {
        return sum + item.product.price * item.quantity;
      }, 0);
    });

    function validate() {
      errors.value = {};
      if (!form.value.recipientName.trim()) errors.value.recipientName = '請輸入收件人姓名';
      if (!form.value.recipientEmail.trim()) {
        errors.value.recipientEmail = '請輸入 Email';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.recipientEmail)) {
        errors.value.recipientEmail = 'Email 格式不正確';
      }
      if (!form.value.recipientAddress.trim()) errors.value.recipientAddress = '請輸入收件地址';
      return Object.keys(errors.value).length === 0;
    }

    async function submitOrder() {
      if (!validate() || submitting.value) return;
      submitting.value = true;
      try {
        const res = await apiFetch('/api/orders', {
          method: 'POST',
          body: JSON.stringify(form.value)
        });
        Notification.show('訂單已建立，正在前往付款...', 'success');
        window.location.href = '/ecpay/payment/' + res.data.id;
      } catch (err) {
        Notification.show(err?.data?.message || '訂單建立失敗', 'error');
      } finally {
        submitting.value = false;
      }
    }

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/cart');
        cartItems.value = res.data.items;
        if (cartItems.value.length === 0) {
          window.location.href = '/cart';
          return;
        }
      } catch (e) {
        window.location.href = '/cart';
        return;
      }
      loading.value = false;
    });

    return { loading, submitting, cartItems, form, errors, cartTotal, submitOrder };
  }
}).mount('#app');
