// Stand-ins for the Shopify-only Liquid tags and filters, so theme files render through liquidjs outside a store.
// The unit tests, the component lab and Storybook all register them from here. They approximate Shopify's output:
// enough to render and test markup, not a replacement for checking the theme on a store.

import { Hash, Tag, evalToken } from 'liquidjs';

const escapeAttribute = (value) =>
  String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const money = (amount) => `$${(amount / 100).toFixed(2)}`;

// The titles Shopify gives the marks `payment_type_svg_tag` draws.
const paymentNames = {
  american_express: 'American Express',
  diners_club: 'Diners Club',
  discover: 'Discover',
  master: 'Mastercard',
  paypal: 'PayPal',
  visa: 'Visa',
};

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

// Block tags whose Liquid body renders as usual, wrapped in `open` and `close`, with `scope` as extra variables.
function registerRenderedBlockTag(engine, name, { open = '', close = '', scope } = {}) {
  engine.registerTag(name, {
    parse(token, tokens) {
      this.templates = [];
      const stream = this.liquid.parser.parseStream(tokens);
      stream
        .on(`tag:end${name}`, () => stream.stop())
        .on('template', (template) => this.templates.push(template))
        .on('end', () => {
          throw new Error(`tag ${token.getText()} not closed`);
        });
      stream.start();
    },
    *render(context, emitter) {
      emitter.write(open);
      if (scope) context.push(scope);
      yield this.liquid.renderer.renderTemplates(this.templates, context, emitter);
      if (scope) context.pop();
      emitter.write(close);
    },
  });
}

// The defaults a section's or block's {% schema %} declares, so its settings read as they would on a store before a
// merchant edits them.
export function schemaDefaults(source) {
  const schema = source.match(/{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/)?.[1];
  if (!schema) return {};
  const settings = JSON.parse(schema).settings ?? [];
  return Object.fromEntries(settings.filter((setting) => setting.id && setting.default !== undefined).map((setting) => [setting.id, setting.default]));
}

// `{% content_for 'blocks' %}` renders the theme blocks of the section or block it sits in, each from
// `blocks/<type>.liquid` with `block` set, inside the `shopify-block` wrapper Shopify adds.
// `{% content_for 'block', type: 'x', id: 'y' %}` renders one static block, taking its settings from the parent's
// `static_blocks` when one has that id; other arguments become variables of the block. As on a store, a section's
// `blocks` leaves its static blocks out. Blocks are arrays of `{ id, type, settings, blocks, static_blocks }`. A
// parent's `theme_blocks`, when set, are the blocks to render, so its `blocks` can hide their settings as a store does.
function registerContentFor(engine, readBlock) {
  const parsed = new Map();
  const load = (type) => {
    if (!parsed.has(type)) {
      const source = readBlock?.(type);
      if (source === undefined) throw new Error(`No block file blocks/${type}.liquid`);
      parsed.set(type, { templates: engine.parse(source), defaults: schemaDefaults(source) });
    }
    return parsed.get(type);
  };

  engine.registerTag(
    'content_for',
    class extends Tag {
      constructor(token, remainTokens, liquid) {
        super(token, remainTokens, liquid);
        this.kind = this.tokenizer.readValue();
        this.arguments = new Hash(this.tokenizer);
      }

      *render(context, emitter) {
        const kind = yield evalToken(this.kind, context);
        const { type, id, ...variables } = yield this.arguments.render(context);
        const parent = context.getSync(['content_for_parent']) ?? context.getSync(['section']) ?? {};
        let blocks;
        if (kind === 'blocks') blocks = parent.theme_blocks ?? parent.blocks ?? [];
        else if (kind === 'block') blocks = [(parent.static_blocks ?? []).find((block) => block.id === id) ?? { id, type }];
        else throw new Error(`content_for '${kind}' is not supported`);

        for (const block of blocks) {
          const { templates, defaults } = load(block.type);
          const resolved = { shopify_attributes: '', blocks: [], ...block, settings: { ...defaults, ...block.settings } };
          emitter.write(`<div id="shopify-block-${block.id}" class="shopify-block">`);
          context.push({ ...variables, block: resolved, content_for_parent: resolved });
          yield this.liquid.renderer.renderTemplates(templates, context, emitter);
          context.pop();
          emitter.write('</div>');
        }
      }
    },
  );
}

// `{% form 'customer', id: 'x', class: 'y' %}` renders a <form> around its body, with `form` set to a fresh form: no
// errors and not yet posted. A `form_state` variable, such as `{ errors: ..., 'posted_successfully?': true }`, stands
// in for a submitted one.
function registerForm(engine) {
  engine.registerTag(
    'form',
    class extends Tag {
      constructor(token, remainTokens, liquid) {
        super(token, remainTokens, liquid);
        this.kind = this.tokenizer.readValue();
        this.arguments = new Hash(this.tokenizer);
        this.templates = [];
        const stream = liquid.parser.parseStream(remainTokens);
        stream
          .on('tag:endform', () => stream.stop())
          .on('template', (template) => this.templates.push(template))
          .on('end', () => {
            throw new Error(`tag ${token.getText()} not closed`);
          });
        stream.start();
      }

      *render(context, emitter) {
        const kind = yield evalToken(this.kind, context);
        const { id, class: className } = yield this.arguments.render(context);
        const attributes = [`method="post"`, `action="/${kind === 'customer' || kind === 'contact' ? 'contact' : kind}"`];
        if (id) attributes.push(`id="${escapeAttribute(id)}"`);
        if (className) attributes.push(`class="${escapeAttribute(className)}"`);
        emitter.write(`<form ${attributes.join(' ')}><input type="hidden" name="form_type" value="${escapeAttribute(kind)}">`);
        const state = context.getSync(['form_state']) ?? {};
        context.push({ form: { errors: null, 'posted_successfully?': false, email: '', ...state } });
        yield this.liquid.renderer.renderTemplates(this.templates, context, emitter);
        context.pop();
        emitter.write('</form>');
      }
    },
  );
}

/**
 * Registers the Shopify tags and filters on a liquidjs engine.
 *
 * @param {import('liquidjs').Liquid} engine
 * @param {object} options
 * @param {object} [options.locale] The parsed `locales/en.default.json`, for the `t` filter.
 * @param {(name: string) => string} [options.readAsset] Returns an asset's text, for `inline_asset_content`.
 * @param {(type: string) => string | undefined} [options.readBlock] Returns `blocks/<type>.liquid`, for `content_for`.
 */
export function registerShopifyLiquid(engine, { locale = {}, readAsset, readBlock } = {}) {
  registerContentFor(engine, readBlock);
  for (const name of ['doc', 'schema', 'javascript']) registerBlockTag(engine, name, () => '');
  registerForm(engine);
  registerBlockTag(engine, 'stylesheet', (content) => `<style>${content}</style>`);
  // `style` renders its Liquid body inside a <style> element; `paginate` renders its body as a single page.
  registerRenderedBlockTag(engine, 'style', { open: '<style>', close: '</style>' });
  registerRenderedBlockTag(engine, 'paginate', {
    scope: { paginate: { current_page: 1, pages: 1, items: 0, parts: [], previous: null, next: null } },
  });

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
  // Shopify prints `%Z` as the zone's abbreviation, such as PST; liquidjs prints its full name.
  const date = engine.filters.date;
  engine.registerFilter('date', function (value, format, ...rest) {
    const zone = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date()).find((part) => part.type === 'timeZoneName').value;
    return date.call(this, value, typeof format === 'string' ? format.replaceAll('%Z', zone) : format, ...rest);
  });
  // A plain card titled with the method's name, where Shopify draws the payment method's mark.
  engine.registerFilter('payment_type_svg_tag', (type, ...attributes) => {
    const name = paymentNames[type] ?? type;
    const options = Object.fromEntries(attributes);
    return `<svg class="${escapeAttribute(options.class ?? '')}" viewBox="0 0 38 24" role="img" aria-labelledby="pi-${type}"><title id="pi-${type}">${escapeAttribute(name)}</title><rect width="37" height="23" x="0.5" y="0.5" rx="3" fill="#fff" stroke="#d4d4d8"/></svg>`;
  });
  // Shopify draws the installments line and the express checkout button itself; these are plain stand-ins. The button
  // is Shopify's plain Buy it now, the one the theme styles. Wallet buttons such as Shop Pay keep Shopify's own look.
  engine.registerFilter('payment_terms', () => '<shopify-payment-terms>Or 4 interest-free payments with Shop Pay</shopify-payment-terms>');
  engine.registerFilter(
    'payment_button',
    () => '<div class="shopify-payment-button"><button type="button" class="shopify-payment-button__button shopify-payment-button__button--unbranded">Buy it now</button></div>',
  );
  engine.registerFilter('video_tag', (media, ...attributes) => {
    const options = Object.fromEntries(attributes);
    const sources = (media.sources ?? []).map((source) => `<source src="${escapeAttribute(source.url)}" type="${escapeAttribute(source.mime_type)}">`).join('');
    return `<video${options.controls ? ' controls' : ''} playsinline preload="${options.preload ?? 'metadata'}" poster="${escapeAttribute(media.preview_image?.src ?? '')}">${sources}</video>`;
  });
  engine.registerFilter('external_video_tag', (media, ...attributes) => {
    const options = Object.fromEntries(attributes);
    return `<iframe class="${escapeAttribute(options.class ?? '')}" src="https://www.youtube.com/embed/${escapeAttribute(media.external_id ?? '')}" title="${escapeAttribute(media.alt ?? '')}" loading="lazy" allowfullscreen></iframe>`;
  });
  engine.registerFilter('money', money);
  engine.registerFilter('money_without_currency', (amount) => (amount / 100).toFixed(2));
  engine.registerFilter('money_with_currency', (amount) => `${money(amount)} USD`);
  engine.registerFilter('money_without_trailing_zeros', (amount) => money(amount).replace(/\.00$/, ''));
  engine.registerFilter('time_tag', (value) => {
    const label = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(value));
    return `<time datetime="${escapeAttribute(value)}">${escapeAttribute(label)}</time>`;
  });
  engine.registerFilter('handle', (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  engine.registerFilter('url_for_vendor', (vendor) => `/collections/vendors?q=${encodeURIComponent(vendor)}`);
  engine.registerFilter('pluralize', (count, singular, plural) => (count === 1 ? singular : plural));
  // Shopify prints nil as null.
  engine.registerFilter('json', (value) => JSON.stringify(value ?? null));
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
