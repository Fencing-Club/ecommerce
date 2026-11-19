// Stand-ins for the Shopify-only Liquid tags and filters, so theme files render through liquidjs outside a store.
// The unit tests, the component lab and Storybook all register them from here. They approximate Shopify's output:
// enough to render and test markup, not a replacement for checking the theme on a store.

const escapeAttribute = (value) =>
  String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const money = (amount) => `$${(amount / 100).toFixed(2)}`;

// Block tags whose body Shopify handles itself. `stylesheet` keeps its CSS inline; the others render nothing.
function registerBlockTag(engine, name, render) {
  engine.registerTag(name, {
    parse(_token, tokens) {
      this.content = '';
      const stream = this.liquid.parser.parseStream(tokens);
      stream.on('token', (token) => {
        if (token.name === `end${name}`) stream.stop();
        else this.content += token.getText();
      });
      stream.start();
    },
    render() {
      return render(this.content);
    },
  });
}

/**
 * Registers the Shopify tags and filters on a liquidjs engine.
 *
 * @param {import('liquidjs').Liquid} engine
 * @param {object} options
 * @param {object} [options.locale] The parsed `locales/en.default.json`, for the `t` filter.
 * @param {(name: string) => string} [options.readAsset] Returns an asset's text, for `inline_asset_content`.
 */
export function registerShopifyLiquid(engine, { locale = {}, readAsset } = {}) {
  for (const name of ['doc', 'schema', 'form', 'javascript']) registerBlockTag(engine, name, () => '');
  registerBlockTag(engine, 'stylesheet', (content) => `<style>${content}</style>`);

  engine.registerFilter('asset_url', (name) => `/assets/${name}`);
  engine.registerFilter('stylesheet_tag', (url) => `<link rel="stylesheet" href="${escapeAttribute(url)}">`);
  engine.registerFilter('inline_asset_content', (name) => {
    if (!readAsset || !/^[a-z0-9-]+\.svg$/.test(name)) throw new Error(`Cannot inline ${name}`);
    return readAsset(name);
  });
  engine.registerFilter('t', (key, ...options) => {
    let value = key.split('.').reduce((current, part) => current?.[part], locale);
    if (value && typeof value === 'object') value = Object.fromEntries(options).count === 1 ? value.one : value.other;
    if (typeof value !== 'string') return key;
    for (const [name, replacement] of options) value = value.replaceAll(`{{ ${name} }}`, String(replacement));
    // Shopify escapes translations unless the key ends in _html.
    return key.endsWith('_html') ? value : escapeAttribute(value).replaceAll("'", '&#39;');
  });
  engine.registerFilter('image_url', (image) => image.src);
  engine.registerFilter('image_tag', (url, ...attributes) => {
    const options = Object.fromEntries(attributes);
    const id = options.id ? ` id="${escapeAttribute(options.id)}"` : '';
    return `<img${id} src="${escapeAttribute(url)}" alt="${escapeAttribute(options.alt ?? '')}" class="${escapeAttribute(options.class ?? '')}" loading="${options.loading ?? 'lazy'}">`;
  });
  engine.registerFilter('placeholder_svg_tag', () => '');
  engine.registerFilter('money', money);
  engine.registerFilter('money_without_currency', (amount) => (amount / 100).toFixed(2));
  engine.registerFilter('money_with_currency', (amount) => `${money(amount)} USD`);
  engine.registerFilter('money_without_trailing_zeros', (amount) => money(amount).replace(/\.00$/, ''));
  engine.registerFilter('time_tag', (value) => {
    const label = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(value));
    return `<time datetime="${escapeAttribute(value)}">${escapeAttribute(label)}</time>`;
  });
  engine.registerFilter('handle', (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  engine.registerFilter('pluralize', (count, singular, plural) => (count === 1 ? singular : plural));
  engine.registerFilter('json', JSON.stringify);
  engine.registerFilter('item_count_for_variant', () => 1);
  engine.registerFilter('standard_event_data', () => '{}');
}

/**
 * The `settings` object a store would pass: each schema default, overridden by the saved theme settings.
 *
 * @param {object} options
 * @param {object[]} options.schema The parsed `config/settings_schema.json`.
 * @param {object} options.data The parsed `config/settings_data.json`.
 */
export function themeSettings({ schema, data }) {
  const defaults = Object.fromEntries(
    schema.flatMap((group) =>
      (group.settings || []).filter((setting) => setting.id && setting.default !== undefined).map((setting) => [setting.id, setting.default]),
    ),
  );
  const current = typeof data.current === 'string' ? data.presets[data.current] : data.current;
  return { ...defaults, ...current };
}

const rgb = (hex) => {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return `${(value >> 16) & 255},${(value >> 8) & 255},${value & 255}`;
};

/**
 * The color scheme variables `layout/theme.liquid` writes for each scheme in the theme settings, with the first scheme
 * on `:root` as well.
 *
 * @param {Record<string, { settings: Record<string, string> }>} schemes The `color_schemes` theme setting.
 */
export function colorSchemeCss(schemes) {
  return Object.entries(schemes)
    .map(([id, { settings }], index) => {
      const selector = `${index === 0 ? ':root, ' : ''}.color-${id}`;
      return `${selector} {
  --color-background: ${rgb(settings.background)};
  --gradient-background: ${settings.background_gradient || settings.background};
  --color-foreground: ${rgb(settings.text)};
  --color-shadow: ${rgb(settings.shadow)};
  --color-button: ${rgb(settings.button)};
  --color-button-text: ${rgb(settings.button_label)};
  --color-secondary-button: ${rgb(settings.background)};
  --color-secondary-button-text: ${rgb(settings.secondary_button_label)};
  --color-link: ${rgb(settings.secondary_button_label)};
  --color-badge-foreground: ${rgb(settings.text)};
  --color-badge-background: ${rgb(settings.background)};
  --color-badge-border: ${rgb(settings.text)};
}`;
    })
    .join('\n');
}
