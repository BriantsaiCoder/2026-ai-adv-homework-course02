const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    const productId = document.getElementById('app').dataset.productId;
    const product = ref(null);
    const related = ref([]);
    const loading = ref(true);
    const notFound = ref(false);
    const quantity = ref(1);
    const adding = ref(false);

    function decrease() {
      if (quantity.value > 1) quantity.value--;
    }

    function increase() {
      if (product.value && quantity.value < product.value.stock) quantity.value++;
    }

    async function addMain() {
      if (!product.value || adding.value) return;
      adding.value = true;
      await addProductToCart(product.value.id, quantity.value);
      adding.value = false;
    }

    async function addToCart(p) {
      if (p._adding) return;
      p._adding = true;
      await addProductToCart(p.id, 1);
      p._adding = false;
    }

    async function loadRelated() {
      try {
        const res = await apiFetch('/api/products?limit=5');
        related.value = res.data.products
          .filter(function (p) { return p.id !== productId; })
          .slice(0, 4)
          .map(function (p) { p._adding = false; return p; });
      } catch (e) {
        related.value = [];
      }
    }

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/products/' + productId);
        product.value = res.data;
        loadRelated();
      } catch (e) {
        notFound.value = true;
      } finally {
        loading.value = false;
      }
    });

    return { product, related, loading, notFound, quantity, adding, decrease, increase, addMain, addToCart, sizedImage };
  }
}).mount('#app');
