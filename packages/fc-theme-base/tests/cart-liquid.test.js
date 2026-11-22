import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Liquid } from 'liquidjs';
import { describe, expect, it } from 'vitest';
import { renderCartFrame } from './component-library.mjs';
import { cartGifts } from './component-library/cart-states.mjs';

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
engine.registerFilter('money', amount => `$${(amount / 100).toFixed(2)}`);
engine.registerFilter('money_without_trailing_zeros', amount => `$${amount / 100}`);

describe('cart rows', () => {
  it('renders the same rows in the flyout and the cart page with view-specific ids', () => {
    for (const [view, rowId, inputId] of [['flyout', 'CartDrawer-Item-1', 'Drawer-quantity-1'], ['page', 'CartItem-1', 'Quantity-1']]) {
      const row = render(view, 'ready').getElementById(rowId);
      expect(row.dataset.lineKey).toBe('8011:jacket');
      expect(row.querySelector('input').id).toBe(inputId);
      expect(text(row.querySelector('.fc-line__price s'))).toBe('$219.95');
      expect(text(row.querySelector('.fc-line__variant'))).toBe('Mens, 44');
      expect(row.querySelector('.fc-badge, a[aria-label^="Edit"]')).toBeNull();
    }
  });

  it('shows kit contents without controls of their own', () => {
    const row = render('flyout', 'ready').getElementById('CartDrawer-Item-2');
    const contents = row.querySelector('details');
    expect(contents.id).toBe('CartContents-drawer-8021-kit');
    expect(text(contents.querySelector('summary'))).toBe('4 included items');
    expect(text(contents.querySelector('li:last-child'))).toContain('2 × Fencing socks');
    expect(contents.querySelector('input, button, cart-remove-button')).toBeNull();
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
  it('shows codes as removable chips in the one summary footer', () => {
    const page = render('flyout', 'discounts-applied');
    const summary = page.querySelector('[data-cart-summary] [data-cart-breakdown]');
    const chip = summary.querySelector('[data-discount-chip="WELCOME10"]');
    expect(chip.querySelector('[data-remove-code="WELCOME10"]').getAttribute('aria-label')).toBe('Remove WELCOME10');
    expect(text(chip.closest('.fc-breakdown__row').querySelector('dd'))).toBe('-$58.89');
    expect(page.querySelectorAll('[data-cart-breakdown]').length).toBe(1);
    expect(page.querySelector('.fc-bar')).toBeNull();
    expect(text(page.querySelector('.fc-total__value'))).toBe('$529.96');
    expect(text(page.querySelector('.fc-savings'))).toBe('You save $88.89');
  });

  it('never invents a shipping price and leaves shipping to checkout until it is free', () => {
    const page = render('page', 'below-free-shipping');
    const row = page.querySelector('[data-cart-summary] [data-shipping-row]');
    expect(text(row.querySelector('dd'))).toBe('Free');
    expect(row.querySelector('[data-shipping-codes]')).not.toBeNull();
    expect(row.hasAttribute('data-free')).toBe(false);
    expect(row.hasAttribute('data-code-free')).toBe(false);
    expect([...page.querySelectorAll('.fc-trust li')].map(text)).toEqual(['Free 30-day returns', 'Secure checkout']);
    const note = page.querySelector('.fc-total__note');
    expect(text(note.querySelector('[data-shipping-note="paid"]'))).toBe('Shipping and taxes calculated at checkout');
    expect(text(note.querySelector('[data-shipping-note="free"]'))).toBe('Taxes calculated at checkout');
  });

  it('lists free shipping once the cart earns it', () => {
    const row = render('page', 'ready').querySelector('[data-cart-summary] [data-shipping-row]');
    expect(row.hasAttribute('data-free')).toBe(true);
    expect(text(row.querySelector('dd'))).toBe('Free');
  });

  it('shows the items subtotal only when it differs from the total', () => {
    expect(render('page', 'ready').querySelector('[data-cart-summary] [data-cart-breakdown]').textContent).not.toContain('Items subtotal');
    expect(text(render('page', 'discounts-applied').querySelector('[data-cart-summary] [data-cart-breakdown]'))).toContain('Items subtotal');
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

describe('free shipping', () => {
  it('shows how far the cart total is from free shipping and keeps shipping for checkout', () => {
    for (const view of ['flyout', 'page']) {
      const page = render(view, 'below-free-shipping');
      const progress = page.querySelector('[data-cart-region="progress"] .fc-progress');
      expect(text(progress.querySelector('.fc-progress__message'))).toBe('$180.10 away from free US shipping');
      // The track runs to the highest reward, the $900 gift.
      expect(progress.querySelector('.fc-progress__fill').getAttribute('style')).toBe('width: 7.77%');
      expect(progress.querySelector('.fc-progress__stop').hasAttribute('data-reached')).toBe(false);
      expect([...progress.querySelectorAll('.fc-progress__label')].map(text)).toEqual(['$250', '$600', '$900']);
      expect(progress.querySelector('.fc-progress__note')).toBeNull();
    }
  });

  it('marks free shipping reached once the total gets there', () => {
    const page = render('flyout', 'ready');
    const progress = page.querySelector('.fc-progress');
    expect(text(progress.querySelector('.fc-progress__message'))).toBe('$11.15 away from a free gift');
    expect(text(progress.querySelector('.fc-progress__note-long'))).toBe('Free US shipping unlocked');
    expect(text(progress.querySelector('.fc-progress__note-short'))).toBe('Free US shipping');
    expect([...progress.querySelectorAll('.fc-progress__stop')].map(stop => stop.hasAttribute('data-reached'))).toEqual([true, false, false]);
  });

  it('shows no progress when the minimum is blank, the cart is in another currency or the shopper is outside the US', async () => {
    const cart = { items: [{}], total_price: 5000, currency: { iso_code: 'USD' } };
    const shop = { currency: 'USD' };
    const us = { country: { iso_code: 'US' } };
    const settings = { cart_free_shipping_threshold: 250 };
    expect((await engine.renderFile('cart-reward-progress', {}, { globals: { cart, shop, localization: us, settings: {} } })).trim()).toBe('');
    expect((await engine.renderFile('cart-reward-progress', {}, { globals: { cart: { ...cart, currency: { iso_code: 'CAD' } }, shop, localization: us, settings } })).trim()).toBe('');
    expect((await engine.renderFile('cart-reward-progress', {}, { globals: { cart, shop, localization: { country: { iso_code: 'CA' } }, settings } })).trim()).toBe('');
    expect(await engine.renderFile('cart-reward-progress', {}, { globals: { cart, shop, localization: us, settings } })).toContain('sections.cart.free_shipping_remaining_html');
  });
});

describe('free gifts', () => {
  const giftKey = 'Free gift at $600';
  const values = options => [...options.querySelectorAll('.fc-gift__input')].map(input => input.value);

  it('offers the gifts for a reached tier in a panel and says how far the next tier is', () => {
    for (const [view, context] of [['flyout', 'drawer'], ['page', 'page']]) {
      const page = render(view, 'gift-ready');
      const panel = page.querySelector('[data-cart-region="gifts"] .fc-gift-choice');
      const title = panel.querySelector('h3');
      expect(text(title)).toBe('Your free gift is ready');
      expect(panel.getAttribute('aria-labelledby')).toBe(title.id);
      const options = panel.querySelector('cart-gift-options');
      expect(options.dataset.giftKey).toBe(giftKey);
      expect(options.querySelector('fieldset').getAttribute('aria-labelledby')).toBe(title.id);
      expect(values(options)).toEqual(['Club socks', 'Training towel']);
      expect(options.querySelector('.fc-gift__input').name).toBe(`CartGift-${context}-60000`);
      expect(options.querySelector('.fc-gift__input:checked')).toBeNull();
      expect(text(options.querySelector('.fc-gift__price'))).toBe('Free$18.00');
      expect([...options.querySelectorAll('.fc-gift')].map(option => text(option.querySelector('.fc-gift__description')) || '')).toEqual(['Cushioned for long training days.', '']);
      expect(text(panel.querySelector('.fc-gift-choice__next'))).toBe("Another gift unlocks at $900. You're $256.20 away.");
      expect(text(page.querySelector('.fc-progress__message'))).toBe('$256.20 away from another free gift');
      expect(page.querySelector('[data-gift-line], cart-gift-sync')).toBeNull();
    }
  });

  it('names each tier when two panels show and says every reward is unlocked', () => {
    const page = render('flyout', 'gift-two-ready');
    const panels = [...page.querySelectorAll('.fc-gift-choice')];
    expect(panels.map(panel => text(panel.querySelector('h3')))).toEqual(['Your $600 gift is ready', 'Your $900 gift is ready']);
    expect(values(panels[1])).toEqual(['Mask bag', 'Repair kit']);
    expect(page.querySelector('.fc-gift-choice__next')).toBeNull();
    expect(text(page.querySelector('.fc-progress__message'))).toBe('Every reward unlocked');
    expect([...page.querySelectorAll('.fc-progress__stop')].every(stop => stop.hasAttribute('data-reached'))).toBe(true);
  });

  it('shows a chosen gift as a free line after the products, with no quantity or remove controls', () => {
    const page = render('page', 'gift-chosen');
    expect(page.querySelector('.fc-gift-choice')).toBeNull();
    expect(page.querySelectorAll('[data-cart-lines] > .fc-line').length).toBe(4);
    const line = page.querySelector('.fc-lines--gifts > [data-gift-line]');
    expect(line.dataset.giftKey).toBe(giftKey);
    expect(text(line.querySelector('.fc-line__name'))).toBe('Club socks');
    expect(text(line.querySelector('.fc-line__price s'))).toBe('$18.00');
    expect(text(line.querySelector('.fc-line__free'))).toBe('Free');
    expect(text(line.querySelector('.fc-line__description'))).toBe('Cushioned for long training days.');
    expect(line.querySelector('.fc-line__variant, .fc-badge')).toBeNull();
    expect(line.querySelector('quantity-input, cart-remove-button')).toBeNull();
    const change = line.querySelector('details.fc-gift-change');
    expect(change.id).toBe('CartGiftChange-page-60000');
    expect(text(change.querySelector('summary'))).toBe('Change gift');
    expect(change.querySelector('fieldset').classList.contains('fc-gifts--list')).toBe(true);
    expect(change.querySelector('.fc-gift__input:checked').value).toBe('Club socks');
    expect(text(page.querySelector('.fc-total__value'))).toBe('$643.80');
  });

  it('shows an unavailable gift but keeps it from being chosen', () => {
    const towel = render('flyout', 'gift-unavailable').querySelector('.fc-gift[data-unavailable]');
    expect(text(towel.querySelector('.fc-gift__name'))).toBe('Training towel');
    expect(towel.querySelector('input').disabled).toBe(true);
    expect(text(towel.querySelector('.fc-gift__price'))).toBe('Unavailable');
  });

  it('clears a chosen gift without a notice when the cart drops under its tier', () => {
    const page = render('flyout', 'gift-removed');
    expect(page.querySelector('.fc-gift-notice')).toBeNull();
    expect(JSON.parse(page.querySelector('cart-gift-sync').dataset.clear)).toEqual([giftKey]);
    expect(page.querySelector('[data-gift-line], .fc-gift-choice')).toBeNull();
  });

  it('adds the gift of a tier that has only one, with no choice to make', () => {
    for (const view of ['flyout', 'page']) {
      const page = render(view, 'gift-added');
      expect(page.querySelector('.fc-gift-choice, .fc-gift-change')).toBeNull();
      const lines = [...page.querySelectorAll('.fc-lines--gifts > [data-gift-line]')];
      expect(lines.map(line => line.dataset.giftKey)).toEqual(['Free gift at $175', 'Free gift at $375']);
      expect(lines.map(line => text(line.querySelector('.fc-line__name')))).toEqual(['Harut point protectors', 'The Fencing Journal']);
      expect(lines.map(line => line.querySelector('.fc-line__name').tagName)).toEqual(['P', 'P']);
      expect(lines.map(line => text(line.querySelector('.fc-line__description')))).toEqual(['A set of 3 to keep your point safe in your bag.', 'Log bouts, drills and goals in one place.']);
      expect(text(lines[0].querySelector('.fc-line__price'))).toBe('Free');
      const sync = page.querySelector('cart-gift-sync');
      expect(JSON.parse(sync.dataset.set)).toEqual([['Free gift at $175', 'Harut point protectors'], ['Free gift at $375', 'The Fencing Journal']]);
      expect(sync.hasAttribute('data-clear')).toBe(false);
      expect([...page.querySelectorAll('.fc-progress__label')].map(text)).toEqual(['$175', '$250', '$375']);
      expect(text(page.querySelector('.fc-progress__message'))).toBe('Every reward unlocked');
    }
  });

  it('clears a single gift when the cart drops under its tier', () => {
    const page = render('flyout', 'gift-added-removed');
    expect(JSON.parse(page.querySelector('cart-gift-sync').dataset.clear)).toEqual(['Free gift at $175']);
    expect(page.querySelector('[data-gift-line]')).toBeNull();
  });

  it('clears choices that match no gift and attributes left from removed tiers', async () => {
    const gifts = cartGifts().map(gift => ({ ...gift, image: { value: null } }));
    const cart = { total_price: 64380, currency: { iso_code: 'USD' }, attributes: { [giftKey]: 'Old mug', 'Free gift at $500': 'Club socks', 'Gift wrap': 'Yes' } };
    const shop = { currency: 'USD', metaobjects: { cart_gift: { values: gifts } } };
    document.body.innerHTML = await engine.renderFile('cart-gifts', { context: 'page' }, { globals: { cart, shop } });
    expect(document.querySelectorAll('.fc-gift-choice').length).toBe(1);
    expect(document.querySelector('.fc-gift__input:checked')).toBeNull();
    expect(JSON.parse(document.querySelector('cart-gift-sync').dataset.clear)).toEqual([giftKey, 'Free gift at $500']);
  });

  it('takes the tiers from the minimums of available gifts, lowest first, in the store currency only', async () => {
    const entry = (minimum, available = true) => ({ minimum_total: { value: minimum }, available: { value: available } });
    const tiers = async (values, currency = 'USD') => {
      const globals = { cart: { currency: { iso_code: currency } }, shop: { currency: 'USD', metaobjects: { cart_gift: { values } } } };
      return (await engine.renderFile('cart-gift-tiers', {}, { globals })).trim();
    };
    expect(await tiers([entry(1000), entry(175), entry(375), entry(175)])).toBe('17500,37500,100000');
    expect(await tiers([entry(175), entry(375, false), entry(null), entry(250, null)])).toBe('17500,25000');
    expect(await tiers([])).toBe('');
    expect(await tiers([entry(175)], 'CAD')).toBe('');
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
    expect(text(empty.querySelector('.ui-button--primary'))).toBe('Shop starter kits');
    expect([...page.querySelectorAll('.fc-popular__name')].map(text)).toEqual(['Starter kits', 'Uniforms', 'Weapons']);
  });

  it('keeps reward amounts out of the empty message', () => {
    for (const view of ['flyout', 'page']) {
      const body = text(render(view, 'empty').querySelector('[data-cart-message="empty"] .ui-message__body'));
      expect(body).toBe('Find everything you need for your next bout, from a first kit to competition gear.');
    }
  });
});

describe('cart sources', () => {
  it('builds the flyout and the cart page from the same parts', async () => {
    const drawer = await readFile(resolve('snippets/cart-drawer.liquid'), 'utf8');
    const page = await readFile(resolve('sections/main-cart-items.liquid'), 'utf8');
    for (const source of [drawer, page]) {
      for (const part of ["render 'cart-lines'", "render 'cart-summary'", "render 'cart-message', kind: 'empty'", "render 'cart-message', kind: 'failed'", "render 'cart-skeleton'"]) expect(source).toContain(part);
    }
  });

  it('uses no dot glyphs as separators and no apostrophes in Mens or Womens', async () => {
    const files = (await readdir(resolve('snippets'))).filter(name => name.startsWith('cart-')).map(name => resolve('snippets', name));
    files.push(resolve('sections/main-cart-items.liquid'), resolve('assets/cart-experience.css'));
    const locale = JSON.parse(await readFile(resolve('locales/en.default.json'), 'utf8'));
    const sources = [...(await Promise.all(files.map(file => readFile(file, 'utf8')))), JSON.stringify(locale.sections.cart)];
    for (const source of sources) {
      expect(source).not.toMatch(/[·•]/);
      expect(source).not.toMatch(/\b(Men|Women)['’]s\b/);
    }
  });
});
