import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Liquid } from 'liquidjs';
import { describe, expect, it } from 'vitest';
import { registerShopifyLiquid } from './helpers/shopify-liquid.mjs';

const themeRoot = resolve(import.meta.dirname, '..');
const engine = new Liquid({ root: [resolve(themeRoot, 'snippets')], extname: '.liquid' });
registerShopifyLiquid(engine, {
  readAsset: (name) => readFileSync(resolve(themeRoot, 'assets', name), 'utf8'),
  locale: JSON.parse(readFileSync(resolve(themeRoot, 'locales/en.default.json'), 'utf8')),
});

const origin = 'https://fencing.club';
const globals = {
  settings: { structured_data_enabled: true },
  request: { page_type: 'index', origin, locale: { iso_code: 'en' } },
  canonical_url: `${origin}/`,
  page_title: 'Fencing Club',
  shop: { name: 'Fencing Club', url: origin, address: {}, metafields: {} },
  pages: {},
  routes: { root_url: '/' },
  cart: { currency: { iso_code: 'USD' } },
};

/** Renders a snippet and returns every JSON-LD node it writes, failing on invalid JSON. */
function jsonLdNodes(name, variables = {}, extraGlobals = {}) {
  const html = engine.renderFileSync(name, variables, { globals: { ...globals, ...extraGlobals } });
  const documentFragment = new DOMParser().parseFromString(html, 'text/html');
  const scripts = [...documentFragment.querySelectorAll('script[type="application/ld+json"]')];
  return { documentFragment, nodes: scripts.flatMap((script) => JSON.parse(script.textContent)['@graph'] ?? JSON.parse(script.textContent)) };
}

const homepageTypes = (extraGlobals) => jsonLdNodes('structured-data', {}, extraGlobals).nodes.map((node) => [node['@type']].flat().join('+'));

describe('homepage structured data', () => {
  const refundPage = { 'refund-policy': { url: '/pages/refund-policy' } };
  const shippingPage = { 'shipping-policy': { url: '/pages/shipping-policy' } };

  it.each([
    ['no policy pages', {}, []],
    ['a return policy only', refundPage, ['MerchantReturnPolicy']],
    ['a shipping policy only', shippingPage, ['ShippingService']],
    ['both policies', { ...refundPage, ...shippingPage }, ['MerchantReturnPolicy', 'ShippingService']],
  ])('stays valid with %s', (_name, pages, policyTypes) => {
    expect(homepageTypes({ pages })).toEqual(['WebSite', 'OnlineStore+Store', ...policyTypes, 'WebPage']);
  });

  it("links the theme's own policy pages before Shopify's legal policies", () => {
    const shop = { ...globals.shop, refund_policy: { url: '/policies/refund-policy' }, shipping_policy: { url: '/policies/shipping-policy' } };
    const { nodes } = jsonLdNodes('structured-data', {}, { shop, pages: { ...refundPage, ...shippingPage } });
    expect(nodes.find((node) => node['@type'] === 'MerchantReturnPolicy').merchantReturnLink).toBe(`${origin}/pages/refund-policy`);
    expect(nodes.find((node) => node['@type'] === 'ShippingService').url).toBe(`${origin}/pages/shipping-policy`);

    const legalOnly = jsonLdNodes('structured-data', {}, { shop }).nodes;
    expect(legalOnly.find((node) => node['@type'] === 'MerchantReturnPolicy').merchantReturnLink).toBe(`${origin}/policies/refund-policy`);
  });
});

describe('breadcrumb structured data', () => {
  const link = (title, handle, links = []) => ({ title, url: `/collections/${handle}`, links });
  // The column heading under Masks links to Masks again.
  const linklists = { 'main-menu': { links: [link('Masks', 'masks', [link('Masks', 'masks', [link('Epee', 'epee-masks')])])] } };
  const product = { title: 'Novus Epee Mask 350N', collections: [{ url: '/collections/masks' }, { url: '/collections/epee-masks' }] };

  it('lists the same trail as the visible breadcrumbs, once per menu collection', () => {
    const { documentFragment, nodes } = jsonLdNodes(
      'collection-category-tree',
      { product, style: 'breadcrumbs', home_label: 'Home' },
      { linklists, canonical_url: `${origin}/products/novus-epee-mask?variant=1` },
    );
    const visible = [...documentFragment.querySelectorAll('nav a, nav [aria-current]')].map((item) => item.textContent.trim());
    expect(visible).toEqual(['Home', 'Masks', 'Epee', 'Novus Epee Mask 350N']);

    const [breadcrumbs] = nodes;
    expect(breadcrumbs.itemListElement.map((item) => item.name)).toEqual(visible);
    expect(breadcrumbs.itemListElement.map((item) => item.position)).toEqual([1, 2, 3, 4]);
    expect(breadcrumbs.itemListElement.map((item) => item.item)).toEqual([
      `${origin}/`,
      `${origin}/collections/masks`,
      `${origin}/collections/epee-masks`,
      `${origin}/products/novus-epee-mask`,
    ]);
  });

  it('writes nothing when structured data is off', () => {
    const { nodes } = jsonLdNodes('ui-breadcrumbs', { root_label: 'Home', root_url: '/', current_label: 'FAQ' }, { settings: {} });
    expect(nodes).toEqual([]);
  });
});
