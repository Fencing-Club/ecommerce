import { Liquid } from 'liquidjs';
import { colorSchemeCss, registerShopifyLiquid, schemaDefaults, themeSettings } from '../tests/helpers/shopify-liquid.mjs';
import locale from '../locales/en.default.json';
import data from '../config/settings_data.json';
import schema from '../config/settings_schema.json';

const basename = (path) => path.slice(path.lastIndexOf('/') + 1);
const byName = (files) => Object.fromEntries(Object.entries(files).map(([path, text]) => [basename(path), text]));

// Snippets and sections share one name space, as `render` resolves them on the store.
const templates = byName(
  import.meta.glob(['../snippets/*.liquid', '../sections/*.liquid'], { query: '?raw', import: 'default', eager: true }),
);
const icons = byName(import.meta.glob('../assets/*.svg', { query: '?raw', import: 'default', eager: true }));
// Theme blocks, which `content_for` renders by type.
const blocks = byName(import.meta.glob('../blocks/*.liquid', { query: '?raw', import: 'default', eager: true }));

const engine = new Liquid({ templates, extname: '.liquid' });
registerShopifyLiquid(engine, { locale, readAsset: (name) => icons[name], readBlock: (type) => blocks[`${type}.liquid`] });
// Where .storybook/main.js serves the theme's assets.
engine.registerFilter('asset_url', (name) => `/theme-assets/${name}`);
export const assetUrl = (name) => `/theme-assets/${name}`;

export const settings = themeSettings({ schema, data });

// The store's details from Settings > Store details, which the footer and contact page show.
const shop = {
  name: 'Fencing Club',
  email: 'support@fencing.club',
  phone: '4252602501',
  address: { street: '17190 128th Pl NE', city: 'Woodinville', province_code: 'WA', zip: '98072' },
  enabled_payment_types: ['visa', 'master', 'american_express', 'paypal', 'diners_club', 'discover'],
  customer_accounts_enabled: true,
};

// The shopper's market and language, with a second of each so the header's selectors show.
const unitedStates = { iso_code: 'US', name: 'United States', currency: { iso_code: 'USD', symbol: '$' } };
const english = { iso_code: 'en', endonym_name: 'English' };
const localization = {
  country: unitedStates,
  language: english,
  available_countries: [{ iso_code: 'CA', name: 'Canada', currency: { iso_code: 'CAD', symbol: '$' } }, unitedStates],
  available_languages: [english, { iso_code: 'fr', endonym_name: 'français' }],
};

const globals = { settings, shop, localization, routes: { root_url: '/', search_url: '/search', cart_url: '/cart' }, cart: { currency: { symbol: '$' } } };

/**
 * Renders a snippet or section with the given variables, as `{% render name, ...variables %}` would.
 *
 * @param {string} name The file name without `.liquid`.
 * @param {Record<string, unknown>} [variables]
 */
export function renderLiquid(name, variables = {}) {
  return engine.renderFileSync(name, variables, { globals });
}

/** The CSS variables layout/theme.liquid writes in its `{% style %}` block. */
export function themeCss() {
  return `${colorSchemeCss(settings.color_schemes)}\n${engine.renderFileSync('theme-tokens', {}, { globals })}`;
}

/**
 * A story `render` function for a snippet: its args become the snippet's variables. `stylesheets` are the theme CSS
 * files the section that renders it would load, beyond the layout's.
 *
 * @param {string} name
 * @param {{ stylesheets?: string[] }} [options]
 */
export const snippet =
  (name, { stylesheets = [] } = {}) =>
  (args) =>
    stylesheets.map((file) => `<link rel="stylesheet" href="${assetUrl(file)}">`).join('') + renderLiquid(name, args);

/**
 * A story `render` function for a theme block: its args become the block's settings, over its schema defaults. The
 * block renders as a section's `{% content_for 'blocks' %}` would, with `blocks` as the blocks nested inside it.
 *
 * @param {string} type The block's file name in `blocks/`, without `.liquid`.
 * @param {{ blocks?: object[] }} [options] Nested blocks, each `{ id, type, settings, blocks }`.
 */
export const block =
  (type, { blocks = [] } = {}) =>
  (settings) =>
    engine.parseAndRenderSync("{% content_for 'blocks' %}", { section: { id: 'story', blocks: [{ id: type, type, settings, blocks }] } }, { globals });

/**
 * A story `render` function for a section built on theme blocks: its args become the section's settings, over its
 * schema defaults. `blocks` are its theme blocks and `staticBlocks` the static ones its `{% content_for 'block' %}`
 * tags render, each `{ id, type, settings, blocks }`. `variables` adds globals such as `blogs`.
 *
 * @param {string} name The section's file name in `sections/`, without `.liquid`.
 * @param {{ blocks?: object[], staticBlocks?: object[], variables?: Record<string, unknown> }} [options]
 */
export const section =
  (name, { blocks = [], staticBlocks = [], variables = {} } = {}) =>
  (settings) => {
    const current = { id: 'story', settings: { ...schemaDefaults(templates[`${name}.liquid`]), ...settings }, blocks, static_blocks: staticBlocks };
    // On a store the snippets a section renders can read `section` too, so it is a global for the render.
    return engine.renderFileSync(name, { ...variables, section: current }, { globals: { ...globals, section: current } });
  };

/**
 * A story loader that runs a theme script once, as the section that renders a snippet would load it. Markup a story
 * renders can't run its own script tags.
 *
 * @param {string} file A file in the theme's assets.
 */
export const loadScript = (file) => () =>
  document.querySelector(`script[data-theme-script="${file}"]`)
    ? Promise.resolve()
    : new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = assetUrl(file);
        script.dataset.themeScript = file;
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
      });
