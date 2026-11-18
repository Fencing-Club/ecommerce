import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Liquid } from 'liquidjs';
import { describe, expect, it } from 'vitest';
import { renderCartFrame } from './component-library.mjs';

// The component lab renders the production flyout and cart page section with cart fixtures.
const render = (view, state) => new DOMParser().parseFromString(renderCartFrame(new URLSearchParams({ view, state })).replace(/<link[^>]*>/g, ''), 'text/html');
const text = element => element?.textContent.replace(/\s+/g, ' ').trim();

const engine = new Liquid({ root: resolve('snippets'), extname: '.liquid' });
engine.registerTag('doc', {
  parse(_token, tokens) {
    const stream = this.liquid.parser.parseStream(tokens);
    stream.on('token', token => { if (token.name === 'enddoc') stream.stop(); });
    stream.start();
  },
  render() { return ''; },
});
engine.registerFilter('t', key => key);

describe('cart rows', () => {
  it('renders the same rows in the flyout and the cart page with view-specific ids', () => {
    for (const [view, rowId, inputId] of [['flyout', 'CartDrawer-Item-1', 'Drawer-quantity-1'], ['page', 'CartItem-1', 'Quantity-1']]) {
      const row = render(view, 'ready').getElementById(rowId);
      expect(row.dataset.lineKey).toBe('8011:jacket');
      expect(row.querySelector('input').id).toBe(inputId);
      expect(text(row.querySelector('.fc-line__price s'))).toBe('$219.95');
      expect(text(row.querySelector('.fc-line__variant'))).toBe('Mens, 44');
      expect(text(row.querySelector('.fc-badge:not(.fc-badge--added)'))).toBe('Save $30.00');
      expect(row.querySelector('a[aria-label^="Edit"]')).not.toBeNull();
    }
  });

  it('shows kit contents without controls of their own and no edit link', () => {
    const row = render('flyout', 'ready').getElementById('CartDrawer-Item-2');
    const contents = row.querySelector('details');
    expect(contents.id).toBe('CartContents-drawer-8021-kit');
    expect(text(contents.querySelector('summary'))).toBe('4 included items');
    expect(text(contents.querySelector('li:last-child'))).toContain('2 × Fencing socks');
    expect(contents.querySelector('input, button, cart-remove-button')).toBeNull();
    expect(row.querySelector('a[aria-label^="Edit"]')).toBeNull();
  });

  it('caps the quantity at the stock and says so under the row', () => {
    const row = render('page', 'stock-limit').getElementById('CartItem-3');
    const input = row.querySelector('input');
    expect(input.max).toBe('2');
    expect(input.dataset.stock).toBe('2');
    const feedback = row.querySelector('.fc-feedback');
    expect(feedback.hidden).toBe(false);
    expect(feedback.dataset.tone).toBe('info');
    expect(text(feedback)).toBe('Only 2 in stock.');
  });

  it('turns an unavailable item into a remove action and blocks checkout until it goes', () => {
    const page = render('flyout', 'unavailable');
    const row = page.getElementById('CartDrawer-Item-2');
    expect(row.hasAttribute('data-unavailable')).toBe(true);
    expect(row.querySelector('quantity-input')).toBeNull();
    expect(text(row.querySelector('cart-remove-button'))).toBe('Remove');
    for (const holder of page.querySelectorAll('[data-checkout-state]')) {
      expect(holder.dataset.checkoutState).toBe('blocked');
      expect(holder.querySelector('button[name="checkout"]').disabled).toBe(true);
      expect(text(holder.querySelector('[data-checkout-reason]'))).toBe('Remove 1 unavailable item to check out');
    }
  });
});

describe('order summary', () => {
  it('shows codes as removable chips in the summary and as plain labels in the phone breakdown', () => {
    const page = render('flyout', 'discounts-applied');
    const summary = page.querySelector('[data-cart-summary] [data-cart-breakdown]');
    const chip = summary.querySelector('[data-discount-chip="WELCOME10"]');
    expect(chip.querySelector('[data-remove-code="WELCOME10"]').getAttribute('aria-label')).toBe('Remove WELCOME10');
    expect(text(chip.closest('.fc-breakdown__row').querySelector('dd'))).toBe('-$58.89');
    const phone = page.querySelector('.fc-bar [data-cart-breakdown]');
    expect(phone.querySelector('[data-discount-chip]')).toBeNull();
    expect(text(phone)).toContain('Discount WELCOME10');
    expect(text(phone)).toContain('Estimated taxes');
    expect(text(page.querySelector('.fc-total__value'))).toBe('$529.96');
    expect(text(page.querySelector('.fc-savings'))).toBe('You save $88.89');
    expect(text(page.querySelector('.fc-bar__value'))).toBe('$529.96');
  });

  it('never invents a shipping price', () => {
    const row = render('page', 'ready').querySelector('[data-shipping-row]');
    expect(row.hasAttribute('data-free')).toBe(false);
    expect(text(row.querySelector('[data-shipping-value="checkout"]'))).toBe('At checkout');
    expect(row.querySelector('[data-shipping-codes]')).not.toBeNull();
  });

  it('keeps a saved note in a card with an edit button and shows no saved indicator', async () => {
    const page = render('flyout', 'note-saved');
    const extras = page.querySelector('cart-extras');
    expect(extras.hasAttribute('data-has-note')).toBe(true);
    expect(text(extras.querySelector('[data-note-text]'))).toBe('Please ship the foil and mask together. Club pickup on Thursday.');
    expect(extras.querySelector('textarea').getAttribute('form')).toBe('CartDrawer-Form');
    expect(extras.querySelector('[data-edit-note]')).not.toBeNull();
    const locale = JSON.parse(await readFile(resolve('locales/en.default.json'), 'utf8'));
    expect(locale.sections.cart.note_saved).toBeUndefined();
    expect(renderCartFrame(new URLSearchParams({ view: 'page', state: 'note-saved' }))).not.toMatch(/note saved/i);
  });

  it('escapes the saved note', async () => {
    const cart = { note: '</textarea><script>bad()</script>' };
    document.body.innerHTML = await engine.renderFile('cart-note-editor', { context: 'drawer', form_id: 'CartDrawer-Form' }, { globals: { cart } });
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('textarea').value).toBe(cart.note);
  });
});

describe('whole-cart messages', () => {
  it('never shows a load failure as an empty cart', () => {
    for (const view of ['flyout', 'page']) {
      const failed = render(view, 'ready').querySelector('[data-cart-message="failed"]');
      expect(text(failed.querySelector('h2'))).toBe("We couldn't load your cart");
      expect(failed.querySelector('[data-cart-retry]')).not.toBeNull();
      expect(text(failed)).not.toContain('empty');
    }
    expect(render('flyout', 'ready').querySelector('[data-cart-message="failed"] a').getAttribute('href')).toBe('/lab/cart-store');
  });

  it('marks an empty cart and offers the shortcut and collections from the theme settings', () => {
    const page = render('page', 'empty');
    expect(page.querySelector('cart-items').dataset.cartState).toBe('empty');
    const empty = page.querySelector('[data-cart-message="empty"]');
    expect(text(empty.querySelector('.fc-button--primary'))).toBe('Shop starter kits');
    expect([...page.querySelectorAll('.fc-popular__name')].map(text)).toEqual(['Starter kits', 'Uniforms', 'Weapons']);
  });

  it('adds the free shipping amount to the empty message only when there is one', async () => {
    const settings = { cart_empty_link: '', cart_empty_link_label: '' };
    const without = await engine.renderFile('cart-message', { kind: 'empty', context: 'page' }, { globals: { settings } });
    expect(without).not.toContain('sections.cart.empty_free_shipping');
    engine.registerFilter('money_without_trailing_zeros', amount => `$${amount / 100}`);
    const withThreshold = await engine.renderFile('cart-message', { kind: 'empty', context: 'page', free_shipping_threshold: 25000 }, { globals: { settings } });
    expect(withThreshold).toContain('sections.cart.empty_free_shipping');
  });
});

describe('cart sources', () => {
  it('builds the flyout and the cart page from the same parts', async () => {
    const drawer = await readFile(resolve('snippets/cart-drawer.liquid'), 'utf8');
    const page = await readFile(resolve('sections/main-cart-items.liquid'), 'utf8');
    for (const source of [drawer, page]) {
      for (const part of ["render 'cart-lines'", "render 'cart-summary'", "render 'cart-checkout-bar'", "render 'cart-message', kind: 'empty'", "render 'cart-message', kind: 'failed'", "render 'cart-skeleton'"]) expect(source).toContain(part);
    }
  });

  it('uses no dot glyphs as separators and no apostrophes in Mens or Womens', async () => {
    const files = (await readdir(resolve('snippets'))).filter(name => name.startsWith('cart-')).map(name => resolve('snippets', name));
    files.push(resolve('sections/main-cart-items.liquid'), resolve('sections/cart-suggestions.liquid'), resolve('assets/cart-experience.css'));
    const locale = JSON.parse(await readFile(resolve('locales/en.default.json'), 'utf8'));
    const sources = [...(await Promise.all(files.map(file => readFile(file, 'utf8')))), JSON.stringify(locale.sections.cart)];
    for (const source of sources) {
      expect(source).not.toMatch(/[·•]/);
      expect(source).not.toMatch(/\b(Men|Women)['’]s\b/);
    }
  });
});
