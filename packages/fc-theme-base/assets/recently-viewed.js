/**
 * Recently viewed products. Product pages put their handle at the front of a list in this browser, and the
 * recently-viewed section shows the newest few from Shopify's product JSON, so prices and photos stay current.
 */
const storageKey = 'fc:recently-viewed';
const keep = 12;

function readHandles() {
  try {
    const handles = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(handles) ? handles.filter((handle) => typeof handle === 'string') : [];
  } catch {
    return [];
  }
}

function writeHandles(handles) {
  try {
    if (handles.length) localStorage.setItem(storageKey, JSON.stringify(handles.slice(0, keep)));
    else localStorage.removeItem(storageKey);
  } catch {
    // Private windows and blocked storage just don't remember.
  }
}

for (const marker of document.querySelectorAll('[data-recently-viewed-product]')) {
  const handle = marker.dataset.recentlyViewedProduct;
  if (handle) writeHandles([handle, ...readHandles().filter((other) => other !== handle)]);
}

function formatPrice(cents) {
  const currency = window.Shopify?.currency?.active ?? 'USD';
  const amount = cents / 100;
  return new Intl.NumberFormat(document.documentElement.lang || undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

if (!customElements.get('recently-viewed')) {
  class RecentlyViewed extends HTMLElement {
    async connectedCallback() {
      this.querySelector('[data-recently-viewed-clear]')?.addEventListener('click', () => {
        writeHandles([]);
        this.hidden = true;
      });
      const limit = Number(this.dataset.limit) || 6;
      const handles = readHandles()
        .filter((handle) => handle !== this.dataset.exclude)
        .slice(0, limit);
      if (!handles.length) return;

      const root = window.Shopify?.routes?.root ?? '/';
      const products = await Promise.all(
        handles.map(async (handle) => {
          try {
            const response = await fetch(`${root}products/${encodeURIComponent(handle)}.js`);
            return response.ok ? await response.json() : null;
          } catch {
            return null;
          }
        }),
      );
      const shown = products.filter(Boolean);
      // Products that no longer exist drop out of the list.
      writeHandles(readHandles().filter((handle) => !handles.includes(handle) || shown.some((product) => product.handle === handle)));
      if (!shown.length) return;

      const template = this.querySelector('[data-recently-viewed-item]');
      const list = this.querySelector('[data-recently-viewed-items]');
      list.replaceChildren(
        ...shown.map((product) => {
          const item = template.content.cloneNode(true);
          item.querySelector('a').href = product.url;
          const image = item.querySelector('img');
          if (product.featured_image) {
            const source = new URL(product.featured_image, window.location.origin);
            source.searchParams.set('width', '240');
            image.src = source.href;
          } else {
            image.remove();
          }
          item.querySelector('.recently-viewed__name').textContent = product.title;
          item.querySelector('.recently-viewed__price').textContent = formatPrice(product.price);
          return item;
        }),
      );
      this.hidden = false;
    }
  }

  customElements.define('recently-viewed', RecentlyViewed);
}
