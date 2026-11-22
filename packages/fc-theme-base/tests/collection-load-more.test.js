import { afterEach, describe, expect, it, vi } from 'vitest';
import '../assets/collection-load-more.js';

const page = (products, nextHref) =>
  `<ul id="product-grid">${products.map((name) => `<li><a href="/products/${name.toLowerCase()}">${name}</a></li>`).join('')}</ul>${
    nextHref
      ? `<collection-load-more data-section-id="main"><nav class="ui-pagination"><a class="ui-pagination__next" href="${nextHref}">Load more</a></nav></collection-load-more>`
      : ''
  }`;

function mount() {
  document.body.innerHTML = page(['Jacket'], '/collections/clothing?page=2#product-grid');
  return document.querySelector('a.ui-pagination__next');
}

const productNames = () => [...document.querySelectorAll('#product-grid > li')].map((item) => item.textContent);

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('collection load more', () => {
  it('appends the next page and keeps a plain link to the page after it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(page(['Pants', 'Plastron'], '/collections/clothing?page=3&section_id=main#product-grid'))));
    mount().click();

    await vi.waitFor(() => expect(productNames()).toEqual(['Jacket', 'Pants', 'Plastron']));
    const requested = new URL(fetch.mock.calls[0][0]);
    expect(requested.searchParams.get('page')).toBe('2');
    expect(requested.searchParams.get('section_id')).toBe('main');
    expect(requested.hash).toBe('');
    expect(document.querySelector('a.ui-pagination__next').getAttribute('href')).toBe('/collections/clothing?page=3#product-grid');
    expect(document.activeElement).toHaveProperty('textContent', 'Pants');
  });

  it('removes the button after the last page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(page(['Gloves']))));
    mount().click();

    await vi.waitFor(() => expect(productNames()).toEqual(['Jacket', 'Gloves']));
    expect(document.querySelector('collection-load-more')).toBeNull();
  });

  it('falls back to the next page when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Unavailable', { status: 503 })));
    const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
    const link = mount();
    link.click();

    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(link.href));
    expect(productNames()).toEqual(['Jacket']);
  });
});
