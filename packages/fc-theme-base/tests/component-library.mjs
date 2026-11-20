import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Liquid } from 'liquidjs';
import { products, articles, localization, announcements, catalogProducts, catalogFixture, commerce, gallery, policy } from './component-library/fixtures.mjs';
import { chartFixtures } from './helpers/sizing-liquid.mjs';
import { registerShopifyLiquid, themeSettings } from './helpers/shopify-liquid.mjs';
import { cartGifts, cartPageStates, cartSettings, cartState, cartStates } from './component-library/cart-states.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const themeRoot = resolve(directory, '..');
const fixtures = resolve(directory, 'component-library');
const locale = JSON.parse(readFileSync(resolve(themeRoot, 'locales/en.default.json'), 'utf8'));
const navigation = JSON.parse(readFileSync(resolve(themeRoot, 'content/navigation-source.json'), 'utf8'));
const popularCategoriesMenu = 'component-lab-categories';
const linklists = { [popularCategoriesMenu]: { links: navigation.menus[0].items.slice(0, 5).map(item => ({ title: item.title, url: '#browsing' })) } };
const engine = new Liquid({ root: [fixtures, resolve(themeRoot, 'snippets'), resolve(themeRoot, 'sections')], extname: '.liquid', cache: process.env.NODE_ENV === 'test' });
const escapeAttribute = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
registerShopifyLiquid(engine, { locale, readAsset: name => readFileSync(resolve(themeRoot, 'assets', name), 'utf8') });

function menuLink(item) {
  return {
    title: item.title,
    handle: item.title.toLowerCase().replaceAll('&', '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    url: '#menu', links: (item.items || []).map(menuLink),
  };
}

function labSettings() {
  const data = JSON.parse(readFileSync(resolve(themeRoot, 'config/settings_data.json'), 'utf8'));
  const schema = JSON.parse(readFileSync(resolve(themeRoot, 'config/settings_schema.json'), 'utf8'));
  return { ...themeSettings({ schema, data }), popular_categories_menu: popularCategoriesMenu, social_instagram_link: '#utilities', social_facebook_link: '#utilities', predictive_search_enabled: true, predictive_search_show_price: true, size_chart_index_page: { url: '#disclosures' } };
}

// Account links stay on the lab page; the account menu reads them from the routes global.
const labRoutes = { root_url: '/', all_products_collection_url: '#cards', search_url: '/lab/search', account_url: '#account', account_login_url: '#account', account_profile_url: '#account', account_logout_url: '#account' };
const accountCustomer = { first_name: 'Alex', name: 'Alex Morgan', email: 'alex@example.com' };

export async function renderLibrary() {
  const settings = labSettings();
  const section = { id: 'component-lab', settings: { menu: { links: navigation.menus[0].items.map(menuLink) }, menu_color_scheme: 'scheme-1', image_zoom: 'modal' } };
  const values = ['S', 'M', 'L', 'XL'].map((label, index) => {
    const value = new String(label);
    Object.assign(value, { id: index + 1, available: index !== 3, selected: index === 1, product_url: '#selection' });
    return value;
  });
  return engine.renderFileSync('page', {
    section, settings, products, articles, search_page: { title: 'Size guides', url: '#cards', content: 'Measure before selecting your equipment.' }, option: { name: 'Size', position: 1, values },
    variant: { id: 'lab-quantity', title: 'Practice glove', quantity_rule: { min: 1, max: 5, increment: 1 } },
    cart: { currency: { symbol: '$' } }, localization, announcements, commerce, gallery, policy, dropdown_section: { id: 'lab-dropdown' }, share_block: { id: 'lab-share', settings: { share_label: 'Share' } }, chart: chartFixtures()[0], catalog: catalogFixture(), routes: labRoutes, account_customer: accountCustomer,
  }, { globals: { section, settings, linklists, localization, cart: { currency: { symbol: '$' } }, routes: labRoutes, pages: {}, collections: {}, shop: { privacy_policy: { url: '#privacy' } } } });
}

export function renderCartIndex() {
  const groups = [];
  for (const state of cartStates) {
    let group = groups.find(entry => entry.name === state.group);
    if (!group) groups.push((group = { name: state.group, id: `cart-${state.group.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, states: [] }));
    group.states.push(state);
  }
  return engine.renderFileSync('cart', { groups, page_states: cartPageStates.map(cartState) });
}

const cartRoutes = { cart_url: '/lab/cart-store', root_url: '/', all_products_collection_url: '#collection' };

export function renderCartFrame(parameters) {
  const view = parameters.get('view') === 'page' ? 'page' : 'flyout';
  const state = cartState(parameters.get('state'));
  const { liquid, json } = state.cart();
  const settings = { ...labSettings(), ...cartSettings, cart_type: view === 'page' ? 'page' : 'drawer' };
  const section = { id: 'lab-cart', blocks: [], settings: {} };
  const cartJson = JSON.stringify(json).replaceAll('</', `<${String.fromCharCode(92)}/`);
  return engine.renderFileSync('cart-frame', { view, state, section, cart_json: cartJson }, { globals: { settings, cart: liquid, routes: cartRoutes, localization, shop: { currency: 'USD', metaobjects: { cart_gift: { values: state.gifts?.() || cartGifts() } } } } });
}

export function renderCatalog(parameters) {
  return engine.renderFileSync('catalog', { catalog: catalogFixture(parameters) }, { globals: { cart: { currency: { symbol: '$' } } } });
}

export function renderSearch(parameters) {
  const terms = parameters.get('q') || '';
  const matched = catalogProducts.filter(product => `${product.title} ${product.type}`.toLowerCase().includes(terms.toLowerCase()));
  const search = { performed: true, terms, resources: { queries: [], collections: [], products: matched, articles: [], pages: [] } };
  if (matched.length) {
    search.resources.queries = [{ text: terms, styled_text: escapeAttribute(terms), url: '#search-components' }];
    search.resources.collections = [{ title: matched[0].type, products_count: matched.length, url: '#browsing' }];
    search.resources.articles = [{ ...articles[0], url: '#cards' }];
    search.resources.pages = [{ title: 'Size guides', url: '#disclosures' }];
  }
  return `<div id="shopify-section-predictive-search">${engine.renderFileSync('predictive-search', { predictive_search: search }, { globals: { settings: { predictive_search_show_price: true, popular_categories_menu: popularCategoriesMenu }, linklists, routes: { search_url: '/lab/search' }, collections: {} } })}</div>`;
}

export function createLibraryServer() {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      const pathname = url.pathname;
      if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
      let body;
      let type = 'text/html; charset=utf-8';
      if (pathname === '/') body = await renderLibrary();
      else if (pathname === '/lab/catalog') body = renderCatalog(url.searchParams);
      else if (pathname === '/lab/search') body = renderSearch(url.searchParams);
      else if (pathname === '/lab/cart') body = renderCartIndex();
      else if (pathname === '/lab/cart/frame') body = renderCartFrame(url.searchParams);
      else if (pathname === '/lab/country-flags.css') {
        type = 'text/css';
        body = engine.parseAndRenderSync(readFileSync(resolve(themeRoot, 'assets/country-flags.css.liquid'), 'utf8'));
      }
      else {
        const roots = { '/assets/': resolve(themeRoot, 'assets'), '/lab/': fixtures, '/fonts/': resolve(themeRoot, 'printables/fonts'), '/content/media/': resolve(themeRoot, 'content/media') };
        const prefix = Object.keys(roots).find(prefix => pathname.startsWith(prefix));
        if (!prefix) { response.writeHead(404); response.end('Not found'); return; }
        const root = await realpath(roots[prefix]);
        const candidate = resolve(root, decodeURIComponent(pathname.slice(prefix.length)));
        if (!candidate.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
        const path = await realpath(candidate);
        if (!path.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
        const types = { '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.pdf': 'application/pdf' };
        type = types[extname(path)];
        if (!type) { response.writeHead(404); response.end(); return; }
        body = await readFile(path);
      }
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
      response.end(error.code === 'ENOENT' ? 'Not found' : 'Component rendering failed');
      if (error.code !== 'ENOENT') process.stderr.write(`${error.stack}\n`);
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.COMPONENT_LAB_PORT || 0);
  const server = createLibraryServer();
  server.listen(port, '127.0.0.1', () => process.stdout.write(`Component lab: http://127.0.0.1:${server.address().port}/\n`));
}