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
const nodeOfType = (nodes, type) => nodes.find((node) => [node['@type']].flat().includes(type));

/** Renders a snippet that outputs text and returns it trimmed. */
const renderText = (name, extraGlobals = {}, variables = {}) =>
  engine.renderFileSync(name, variables, { globals: { ...globals, ...extraGlobals } }).trim();

describe('homepage structured data', () => {
  it('lists every social profile the theme settings link', () => {
    const settings = {
      ...globals.settings,
      social_facebook_link: 'https://www.facebook.com/fencingclubstore',
      social_instagram_link: 'https://www.instagram.com/fencingclub.shop',
      social_youtube_link: 'https://www.youtube.com/@fencingclub',
      social_tiktok_link: '',
    };
    const store = nodeOfType(jsonLdNodes('structured-data', {}, { settings }).nodes, 'OnlineStore');
    expect(store.sameAs).toEqual([settings.social_facebook_link, settings.social_instagram_link, settings.social_youtube_link]);
  });

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

describe('product structured data', () => {
  const variant = (id, size) => ({ id, title: size, options: [size], price: 7595, available: true, barcode: '', sku: `mask-${size}` });
  const variants = [variant(1, 'S'), variant(2, 'M')];
  const product = (metafields = {}) => ({
    id: 7,
    title: 'Novus Epee Mask 350N',
    description: '<p>An entry-level 350N mask.</p>',
    vendor: 'Fencing Club',
    options: ['Size'],
    variants,
    selected_or_first_available_variant: variants[0],
    metafields,
  });
  const productGlobals = (metafields) => ({
    request: { ...globals.request, page_type: 'product' },
    canonical_url: `${origin}/products/novus-epee-mask`,
    product: product(metafields),
  });

  it("gives the product the @id Judge.me's rating joins, with or without variants", () => {
    const productId = `${origin}/products/novus-epee-mask#product`;
    const group = nodeOfType(jsonLdNodes('structured-data', {}, productGlobals({})).nodes, 'ProductGroup');
    expect(group['@id']).toBe(productId);

    const single = { ...productGlobals({}), product: { ...product(), variants: [variants[0]] } };
    expect(nodeOfType(jsonLdNodes('structured-data', {}, single).nodes, 'Product')['@id']).toBe(productId);
  });

  it("keeps the description on the group, not on each variant", () => {
    const group = nodeOfType(jsonLdNodes('structured-data', {}, productGlobals({})).nodes, 'ProductGroup');
    expect(group.description).toBe('An entry-level 350N mask.');
    expect(group.hasVariant.map((item) => item.description)).toEqual([undefined, undefined]);
  });
});

describe('article structured data', () => {
  const article = (author) => ({
    title: 'How to Structure a 90-Minute Fencing Practice',
    author,
    published_at: '2026-08-31T20:07:08-07:00',
    updated_at: '2026-08-31T20:07:10-07:00',
    content: '<p>Warm up, then footwork.</p>',
  });
  const articleGlobals = (author) => ({
    request: { ...globals.request, page_type: 'article' },
    canonical_url: `${origin}/blogs/journal/practice`,
    article: article(author),
    blog: { title: 'The Journal', url: '/blogs/journal' },
  });

  it('credits the store when the shop account wrote it, and a person otherwise', () => {
    const byStore = nodeOfType(jsonLdNodes('structured-data', {}, articleGlobals('Fencing Club')).nodes, 'BlogPosting');
    expect(byStore.author).toEqual({ '@id': `${origin}/#organization` });
    expect(byStore.articleBody).toBeUndefined();
    const byPerson = nodeOfType(jsonLdNodes('structured-data', {}, articleGlobals('Sam Lee')).nodes, 'BlogPosting');
    expect(byPerson.author).toEqual({ '@type': 'Person', name: 'Sam Lee' });
  });
});

describe('collection list structured data', () => {
  it('lists the collections the page shows', () => {
    const collections = [{ title: 'Masks', url: '/collections/masks' }, { title: 'Blades', url: '/collections/blades' }];
    const { nodes } = jsonLdNodes(
      'structured-data',
      { collection_item_list_enabled: true, collection_item_list: collections, collection_item_count: 30, collection_position_offset: 28 },
      { request: { ...globals.request, page_type: 'list-collections' }, canonical_url: `${origin}/collections?page=2`, page_title: 'Collections' },
    );
    expect(nodeOfType(nodes, 'CollectionPage').mainEntity).toEqual({ '@id': `${origin}/collections?page=2#item-list` });
    expect(nodeOfType(nodes, 'ItemList').itemListElement.map((item) => [item.position, item.name, item.url])).toEqual([
      [29, 'Masks', `${origin}/collections/masks`],
      [30, 'Blades', `${origin}/collections/blades`],
    ]);
  });
});

describe('meta description', () => {
  const collectionGlobals = (vendors) => ({
    request: { ...globals.request, page_type: 'collection' },
    collection: { title: 'Epee Masks', products_count: 12, all_vendors: vendors },
  });

  it.each([
    [[], 'Epee Masks at Fencing Club: 12 products.'],
    [['Leon Paul'], 'Epee Masks at Fencing Club: 12 products from Leon Paul.'],
    [['Leon Paul', 'PBT'], 'Epee Masks at Fencing Club: 12 products from Leon Paul and PBT.'],
    [['Absolute', 'Leon Paul', 'PBT'], 'Epee Masks at Fencing Club: 12 products from Absolute, Leon Paul, and PBT.'],
    [['Absolute', 'Allstar', 'Leon Paul', 'PBT'], 'Epee Masks at Fencing Club: 12 products from Absolute, Allstar, Leon Paul, and more.'],
  ])('describes a collection without one from its brands %j', (vendors, description) => {
    expect(renderText('meta-description', collectionGlobals(vendors))).toBe(description);
  });

  it('describes a blog without one from its latest article', () => {
    const blog = { title: 'The Journal', articles_count: 3, articles: [{ title: 'How to Wash Fencing Whites' }] };
    expect(renderText('meta-description', { request: { ...globals.request, page_type: 'blog' }, blog })).toBe(
      'The Journal from Fencing Club. Latest article: How to Wash Fencing Whites.',
    );
  });

  it("keeps the page's own description, escaped once", () => {
    const extra = { ...collectionGlobals(['PBT']), page_description: '<p>Masks & bibs for "épée"</p>' };
    // Decoding once gives the text back, so the description is ready for an attribute without double escaping.
    const decoder = document.createElement('textarea');
    decoder.innerHTML = renderText('meta-description', extra);
    expect(decoder.value).toBe('Masks & bibs for "épée"');
  });
});

describe('social meta tags', () => {
  it.each(['https://x.com/fencingclub', 'https://twitter.com/fencingclub/', 'https://x.com/fencingclub?lang=en'])(
    'reads the X handle from %s',
    (link) => {
      const html = renderText('meta-tags', { settings: { social_twitter_link: link } });
      expect(new DOMParser().parseFromString(html, 'text/html').querySelector('meta[name="twitter:site"]').content).toBe('@fencingclub');
    },
  );
});

describe('brand links', () => {
  const brandUrl = (collections) => renderText('brand-url', { collections }, { vendor: 'Leon Paul' });

  it("goes to the brand's collection when it has products", () => {
    expect(brandUrl({ 'leon-paul': { url: '/collections/leon-paul', products_count: 12 } })).toBe('/collections/leon-paul');
  });

  it("falls back to Shopify's vendor page without one, or when it's empty", () => {
    expect(brandUrl({})).toBe('/collections/vendors?q=Leon%20Paul');
    expect(brandUrl({ 'leon-paul': { url: '/collections/leon-paul', products_count: 0 } })).toBe('/collections/vendors?q=Leon%20Paul');
  });
});
