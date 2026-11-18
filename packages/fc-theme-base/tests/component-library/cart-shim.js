// Stands in for what Shopify adds to a storefront. Reads come from the fixture; every write fails, so the lab
// never changes a cart and a click on a cart control shows that control's failure state.
window.StandardEvents = {
  createViewEventElement: Base => class extends Base {
    connectedCallback() {}
    dispatchViewEvent() {}
  },
};
window.Shopify = window.Shopify || {};

const labCart = JSON.parse(document.getElementById('LabCart').textContent);
const nativeFetch = window.fetch.bind(window);
window.fetch = (input, options = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  if (!url.pathname.startsWith('/lab/cart-store')) return nativeFetch(input, options);
  const method = (options.method || 'GET').toUpperCase();
  if (method === 'GET' && url.pathname === '/lab/cart-store.js') {
    return Promise.resolve(new Response(JSON.stringify(labCart), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  const body = JSON.stringify({ status: 503, message: 'The component lab does not change carts.', description: 'The component lab does not change carts.' });
  return new Promise(resolve => setTimeout(() => resolve(new Response(body, { status: 503, headers: { 'Content-Type': 'application/json' } })), 400));
};
