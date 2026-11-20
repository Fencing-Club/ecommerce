import { Liquid } from 'liquidjs';
import { colorSchemeCss, registerShopifyLiquid, themeSettings } from '../tests/helpers/shopify-liquid.mjs';
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

const globals = { settings, routes: { root_url: '/', search_url: '/search', cart_url: '/cart' }, cart: { currency: { symbol: '$' } } };

/**
 * Renders a snippet or section with the given variables, as `{% render name, ...variables %}` would.
 *
 * @param {string} name The file name without `.liquid`.
 * @param {Record<string, unknown>} [variables]
 */
export function renderLiquid(name, variables = {}) {
  return engine.renderFileSync(name, variables, { globals });
}

/**
 * Renders a section the way a template or section group places it: `section` and the page's resources (`product`,
 * `collection` and the rest) are Liquid globals.
 *
 * @param {string} type The section file name without `.liquid`.
 * @param {object} section The section's `id`, `settings` and `blocks`. `{% content_for 'blocks' %}` renders the blocks from
 *   `blocks/<type>.liquid`; see `registerShopifyLiquid`.
 * @param {Record<string, unknown>} [resources]
 */
export function renderSection(type, section, resources = {}) {
  return engine.renderFileSync(type, {}, { globals: { ...globals, ...resources, section } });
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
