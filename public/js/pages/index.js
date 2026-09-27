const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    const products = ref([]);
    const spotlight = ref(null);
    const pagination = ref({ total: 0, page: 1, limit: 8, totalPages: 0 });
    const loading = ref(true);

    async function loadProducts(page) {
      page = page || 1;
      loading.value = true;
      try {
        const res = await apiFetch('/api/products?page=' + page + '&limit=8');
        products.value = res.data.products.map(function (p) {
          p._adding = false;
          return p;
        });
        pagination.value = res.data.pagination;
        if (!spotlight.value && products.value.length > 0) {
          spotlight.value = { ...products.value[0] };
        }
      } catch (e) {
        products.value = [];
      } finally {
        loading.value = false;
      }
    }

    async function addToCart(product) {
      if (product._adding) return;
      product._adding = true;
      await addProductToCart(product.id, 1);
      product._adding = false;
    }

    onMounted(function () {
      loadProducts(1);
    });

    return { products, spotlight, pagination, loading, loadProducts, addToCart, sizedImage };
  }
}).mount('#app');
