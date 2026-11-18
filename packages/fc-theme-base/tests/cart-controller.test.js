import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderCartFrame } from './component-library.mjs';

// Mounts the production flyout or cart page markup from the component lab fixtures.
function mount(view, state = 'ready') {
  const page = new DOMParser().parseFromString(renderCartFrame(new URLSearchParams({ view, state })).replace(/<link[^>]*>/g, ''), 'text/html');
  page.querySelectorAll('script').forEach(script => script.remove());
  document.body.innerHTML = page.body.innerHTML;
  return document.querySelector('cart-drawer-items, cart-items');
}
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => '' });
const controller = () => customElements.get('cart-items');
const holder = () => document.querySelector('[data-cart-summary]');

beforeAll(async () => {
  window.StandardEvents = { createViewEventElement: Base => class extends Base { connectedCallback() {} dispatchViewEvent() {} } };
  vi.stubGlobal('ON_CHANGE_DEBOUNCE_TIMER', 0);
  vi.stubGlobal('PUB_SUB_EVENTS', { cartUpdate: 'cart-update' });
  vi.stubGlobal('subscribe', () => () => {});
  vi.stubGlobal('publish', () => {});
  vi.stubGlobal('fetchConfig', () => ({ method: 'POST', headers: {} }));
  vi.stubGlobal('routes', { cart_url: '/cart', cart_add_url: '/cart/add.js', cart_change_url: '/cart/change.js', cart_update_url: '/cart/update.js' });
  window.cartStrings = {
    quantityChangeError: "We couldn't change the quantity.", removeError: "We couldn't remove this item.", stockLimit: 'Only [count] in stock.',
    removed: '[title] removed', undoError: "We couldn't add [title] back.", itemAdded: '[title] added to your cart',
    blockedNote: 'Save or clear your note to check out', blockedUnavailableOne: 'Remove [count] unavailable item to check out',
    blockedUnavailableOther: 'Remove [count] unavailable items to check out', checkoutFailed: "Checkout didn't open.",
  };
  await import('../assets/cart.js');
  // Theme scripts share top-level classes the way browser scripts do.
  vi.stubGlobal('CartItems', customElements.get('cart-items'));
  await import('../assets/cart-drawer.js');
  await import('../assets/cart-controls.js');
});
afterEach(() => {
  document.body.replaceChildren();
  controller().mutationCount = 0;
  controller().updateCheckoutState();
  vi.restoreAllMocks();
});

describe('checkout availability', () => {
  it('runs cart requests one at a time and holds checkout until they finish', async () => {
    mount('page');
    let finish;
    const order = [];
    const first = controller().mutate(() => new Promise(resolve => { order.push('first'); finish = resolve; }));
    const second = controller().mutate(() => { order.push('second'); });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    expect(holder().dataset.checkoutState).toBe('waiting');
    expect(holder().querySelector('[name="checkout"]').disabled).toBe(true);
    expect(order).toEqual(['first']);
    finish();
    await Promise.all([first, second]);
    expect(order).toEqual(['first', 'second']);
    expect(holder().dataset.checkoutState).toBe('ready');
    expect(holder().querySelector('[name="checkout"]').disabled).toBe(false);
  });

  it('waits during the quantity debounce, before the request starts', async () => {
    const view = mount('flyout');
    const change = vi.spyOn(view, 'onChange').mockImplementation(() => {});
    view.querySelector('input[data-index]').dispatchEvent(new Event('change', { bubbles: true }));
    expect(holder().dataset.checkoutState).toBe('waiting');
    await vi.waitFor(() => expect(change).toHaveBeenCalledOnce());
    expect(holder().dataset.checkoutState).toBe('ready');
  });

  it('says what to do under the button: save the note, or remove unavailable items', () => {
    mount('flyout');
    const note = document.querySelector('cart-note');
    note.textarea.value = 'Club pickup';
    note.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    expect(holder().dataset.checkoutState).toBe('blocked');
    expect(holder().dataset.reasonTone).toBe('info');
    expect(holder().querySelector('[data-checkout-reason]').textContent).toBe('Save or clear your note to check out');
    note.textarea.value = '';
    document.querySelector('.fc-line').setAttribute('data-unavailable', '');
    controller().updateCheckoutState();
    expect(holder().dataset.reasonTone).toBe('error');
    expect(holder().querySelector('[data-checkout-reason]').textContent).toBe('Remove 1 unavailable item to check out');
  });

  it('shows why checkout did not open and lets the shopper try again', () => {
    mount('page');
    holder().setAttribute('data-failed', '');
    controller().updateCheckoutState();
    expect(holder().dataset.checkoutState).toBe('failed');
    expect(holder().querySelector('[data-checkout-reason]').textContent).toBe("Checkout didn't open.");
    expect(holder().querySelector('[name="checkout"]').disabled).toBe(false);
  });
});

describe('line changes', () => {
  it('shows a failed quantity change on that row and puts the quantity back', async () => {
    const view = mount('flyout');
    vi.stubGlobal('fetch', vi.fn(async () => json({ status: 500, message: 'Unavailable' }, 500)));
    const row = view.querySelector('.fc-line[data-line="3"]');
    const input = row.querySelector('input');
    input.value = '5';
    await view.updateQuantity('3', 5);
    expect(row.hasAttribute('data-state')).toBe(false);
    expect(input.value).toBe('2');
    expect(row.querySelector('.fc-feedback').hidden).toBe(false);
    expect(row.querySelector('.fc-feedback__text').textContent).toBe("We couldn't change the quantity.");
  });

  it('explains a stock limit instead of an error when Shopify refuses more than the stock', async () => {
    const view = mount('page', 'stock-limit');
    vi.stubGlobal('fetch', vi.fn(async () => json({ status: 422, message: 'Out of stock' }, 422)));
    const row = view.querySelector('.fc-line[data-line="3"]');
    await view.updateQuantity('3', 3);
    expect(row.querySelector('.fc-feedback').dataset.tone).toBe('info');
    expect(row.querySelector('.fc-feedback__text').textContent).toBe('Only 2 in stock.');
  });

  it('says when a removal fails', async () => {
    const view = mount('flyout');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Offline'); }));
    const row = view.querySelector('.fc-line[data-line="1"]');
    await view.updateQuantity('1', 0);
    expect(row.querySelector('.fc-feedback__text').textContent).toBe("We couldn't remove this item.");
  });

  it('leaves an undo row after a removal that adds the same line back', async () => {
    const view = mount('flyout');
    vi.spyOn(view, 'renderSections').mockImplementation(() => {});
    const requests = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      requests.push([url, JSON.parse(options.body)]);
      return url === '/cart/change.js' ? json({ items: [], sections: {} }) : json({ status: 500 }, 500);
    }));
    // Shopify's Liquid serializes empty line properties as [].
    view.querySelector('.fc-line[data-line="3"]').dataset.properties = '[]';
    await view.updateQuantity('3', 0);
    const removed = view.querySelector('.fc-line--removed');
    expect(removed.querySelector('[data-removed-text]').textContent).toBe('Grip fencing glove removed');
    expect([...view.querySelectorAll('[data-cart-lines] > li')].indexOf(removed)).toBe(2);
    await view.undoRemove(removed);
    expect(requests[1]).toEqual(['/cart/add.js', expect.objectContaining({ items: [{ id: 8031, quantity: 2 }] })]);
    expect(removed.querySelector('.fc-feedback__text').textContent).toBe("We couldn't add Grip fencing glove back.");
    expect(removed.querySelector('[data-undo-remove]').disabled).toBe(false);
  });

  it('highlights a just added row with a toast until the next change', () => {
    const view = mount('flyout');
    view.markJustAdded({ key: '8021:kit', product_title: 'Club starter kit' });
    expect(view.querySelector('.fc-line[data-line-key="8021:kit"]').hasAttribute('data-just-added')).toBe(true);
    expect(document.querySelector('[data-cart-toast]').hidden).toBe(false);
    expect(document.querySelector('[data-cart-toast-text]').textContent).toBe('Club starter kit added to your cart');
    view.clearJustAdded();
    expect(document.querySelector('.fc-line[data-just-added]')).toBeNull();
    expect(document.querySelector('[data-cart-toast]').hidden).toBe(true);
  });
});

describe('refreshing', () => {
  it('swaps only marked regions, so open editors and unsaved notes survive', () => {
    mount('page');
    const extras = document.querySelector('cart-extras');
    extras.open('note');
    extras.querySelector('textarea').value = 'Keep this';
    document.querySelector('.fc-line__contents').setAttribute('open', '');
    const fresh = new DOMParser().parseFromString(renderCartFrame(new URLSearchParams({ view: 'page', state: 'stock-limit' })).replace(/<link[^>]*>/g, ''), 'text/html');
    controller().applyRegions(document.querySelector('cart-items'), fresh);
    expect(document.querySelector('cart-extras')).toBe(extras);
    expect(extras.dataset.open).toBe('note');
    expect(extras.querySelector('textarea').value).toBe('Keep this');
    expect(document.querySelector('.fc-line__contents').open).toBe(true);
    expect(document.querySelector('.fc-line[data-line="3"] .fc-feedback__text').textContent).toBe('Only 2 in stock.');
  });

  it('shows the load failed message on a failed refresh, never the empty cart', async () => {
    const view = mount('flyout');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 503)));
    await view.refresh({ visible: true });
    const drawer = document.querySelector('cart-drawer');
    expect(drawer.dataset.loadState).toBe('failed');
    expect(drawer.dataset.cartState).toBe('ready');
  });
});

describe('discount code and order note', () => {
  it('saves the note to every view and closes the editor; a failure keeps the text and the editor', async () => {
    mount('flyout');
    const extras = document.querySelector('cart-extras');
    const note = document.querySelector('cart-note');
    extras.open('note');
    note.textarea.value = 'Club pickup';
    vi.stubGlobal('fetch', vi.fn(async () => json({ note: 'Club pickup' })));
    await note.save();
    expect(extras.hasAttribute('data-open')).toBe(false);
    expect(extras.hasAttribute('data-has-note')).toBe(true);
    expect(note.querySelector('[data-note-text]').textContent).toBe('Club pickup');
    extras.open('note');
    note.textarea.value = 'Changed';
    fetch.mockRejectedValue(new Error('Offline'));
    await note.save();
    expect(extras.dataset.open).toBe('note');
    expect(note.textarea.value).toBe('Changed');
    expect(note.feedback.hidden).toBe(false);
    expect(note.feedback.textContent).toContain("We couldn't save your note.");
  });

  it('closes the note editor without saving, putting back the saved note and freeing checkout', () => {
    mount('flyout', 'note-saved');
    const extras = document.querySelector('cart-extras');
    const note = document.querySelector('cart-note');
    const saved = note.savedNote;
    extras.open('note');
    expect(note.textarea.selectionStart).toBe(saved.length);
    note.textarea.value = 'Changed';
    note.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    expect(holder().dataset.checkoutState).toBe('blocked');
    vi.stubGlobal('fetch', vi.fn());
    note.querySelector('[data-cancel-note]').click();
    expect(fetch).not.toHaveBeenCalled();
    expect(extras.hasAttribute('data-open')).toBe(false);
    expect(note.textarea.value).toBe(saved);
    expect(note.isDirty).toBe(false);
    expect(holder().dataset.checkoutState).toBe('ready');
    expect(document.querySelector('.fc-editor__hint')).toBeNull();
  });

  it('adds a code to the ones already applied and closes the editor', async () => {
    mount('flyout');
    const extras = document.querySelector('cart-extras');
    const discount = document.querySelector('cart-discount');
    vi.spyOn(customElements.get('cart-drawer-items').prototype, 'onCartUpdate').mockResolvedValue();
    let codes = [{ code: 'EXISTING', applicable: true }];
    const posts = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      if (options?.body) {
        const data = JSON.parse(options.body);
        posts.push(data);
        codes = data.discount.split(',').map(code => ({ code, applicable: true }));
      }
      return json({ discount_codes: codes });
    }));
    extras.open('discount');
    discount.input.value = 'CLUB';
    await discount.apply();
    expect(posts[0]).toEqual({ discount: 'EXISTING,CLUB' });
    expect(extras.hasAttribute('data-open')).toBe(false);
    expect(discount.input.value).toBe('');
  });

  it('names the code Shopify did not accept and keeps it in the field', async () => {
    mount('page');
    const discount = document.querySelector('cart-discount');
    vi.stubGlobal('fetch', vi.fn(async () => json({ discount_codes: [{ code: 'NOPE', applicable: false }] })));
    discount.closest('cart-extras').open('discount');
    discount.input.value = 'NOPE';
    await discount.apply();
    expect(discount.dataset.state).toBe('invalid');
    expect(discount.input.getAttribute('aria-invalid')).toBe('true');
    expect(discount.feedback.textContent).toContain("NOPE can't be used with this order.");
    expect(discount.input.value).toBe('NOPE');
    fetch.mockRejectedValue(new Error('Offline'));
    await discount.apply();
    expect(discount.feedback.textContent).toContain("We couldn't check this code.");
    expect(discount.querySelector('[data-apply-discount]').disabled).toBe(false);
  });

  it('removes one code and keeps the others; a failure shows under the summary rows', async () => {
    mount('page', 'discounts-applied');
    vi.spyOn(customElements.get('cart-items').prototype, 'onCartUpdate').mockResolvedValue();
    const posts = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      if (options?.body) posts.push(JSON.parse(options.body));
      return json({ discount_codes: [{ code: 'WELCOME10', applicable: true }, { code: 'FREESHIP', applicable: true }] });
    }));
    const chip = document.querySelector('[data-discount-chip="WELCOME10"]');
    await customElements.get('cart-discount').remove('WELCOME10', chip);
    expect(posts[0]).toEqual({ discount: 'FREESHIP' });
    fetch.mockRejectedValue(new Error('Offline'));
    await customElements.get('cart-discount').remove('WELCOME10', chip);
    const feedback = document.querySelector('[data-discount-feedback] .fc-feedback');
    expect(feedback.hidden).toBe(false);
    expect(feedback.textContent).toContain("We couldn't remove WELCOME10.");
  });

  it('puts shipping codes on the Shipping row, which then reads Free', async () => {
    mount('page', 'discounts-applied');
    vi.spyOn(controller(), 'fetchCartData').mockResolvedValue({ discount_codes: [{ code: 'WELCOME10', applicable: true }, { code: 'FREESHIP', applicable: true }] });
    await customElements.get('cart-discount').syncShippingCodes();
    const row = document.querySelector('[data-cart-summary] [data-shipping-row]');
    expect([...row.querySelectorAll('[data-discount-chip]')].map(chip => chip.dataset.discountChip)).toEqual(['FREESHIP']);
    expect(row.querySelector('[data-remove-code]').getAttribute('aria-label')).toBe('Remove FREESHIP');
    expect([...document.querySelectorAll('[data-shipping-row]')].every(element => element.hasAttribute('data-code-free'))).toBe(true);
  });
});

describe('free gifts', () => {
  const giftKey = 'Free gift at $600';
  const pick = (options, value) => {
    const input = options.querySelector(`.fc-gift__input[value="${value}"]`);
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input;
  };

  it('saves the chosen gift on the cart as the tier attribute and refreshes the views', async () => {
    mount('flyout', 'gift-ready');
    const refresh = vi.spyOn(customElements.get('cart-drawer-items').prototype, 'onCartUpdate').mockResolvedValue();
    const posts = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      const body = JSON.parse(options.body);
      posts.push([url, body]);
      return json({ attributes: body.attributes });
    }));
    const options = document.querySelector('cart-gift-options');
    pick(options, 'Club socks, One size');
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(posts).toEqual([['/cart/update.js', { attributes: { [giftKey]: 'Club socks, One size' } }]]);
    expect(options.feedback.hidden).toBe(true);
  });

  it('puts the earlier choice back and names the gift when a pick fails', async () => {
    mount('flyout', 'gift-unavailable');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Offline'); }));
    const options = document.querySelector('cart-gift-options');
    pick(options, 'Club socks, One size');
    await vi.waitFor(() => expect(options.feedback.hidden).toBe(false));
    expect(options.feedback.textContent).toContain("We couldn't add Club socks.");
    expect(options.querySelector('.fc-gift__input:checked')).toBeNull();
    expect(options.hasAttribute('aria-busy')).toBe(false);
    expect(options.querySelector('.fc-gift:not([data-unavailable]) input').disabled).toBe(false);
    expect(options.querySelector('.fc-gift[data-unavailable] input').disabled).toBe(true);
  });

  it('keeps the chosen gift when Shopify does not save the change', async () => {
    mount('page', 'gift-chosen');
    vi.stubGlobal('fetch', vi.fn(async () => json({ attributes: { [giftKey]: 'Club socks, One size' } })));
    const options = document.querySelector('.fc-gift-change cart-gift-options');
    pick(options, 'Training towel, Charcoal');
    await vi.waitFor(() => expect(options.feedback.hidden).toBe(false));
    expect(options.feedback.textContent).toContain("We couldn't switch to Training towel.");
    expect(options.querySelector('.fc-gift__input:checked').value).toBe('Club socks, One size');
  });

  it('clears a gift the cart no longer reaches with one request, however many views ask', async () => {
    const posts = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      posts.push(JSON.parse(options.body));
      return json({});
    }));
    mount('flyout', 'gift-removed');
    document.body.append(document.querySelector('cart-gift-sync').cloneNode());
    await vi.waitFor(() => expect(posts).toEqual([{ attributes: { [giftKey]: '' } }]));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(posts.length).toBe(1);
    expect(document.querySelector('.fc-gift-notice')).not.toBeNull();
  });

  it('saves the gift of a tier with only one gift without rendering again', async () => {
    const refresh = vi.spyOn(customElements.get('cart-drawer-items').prototype, 'onCartUpdate').mockResolvedValue();
    const posts = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      posts.push(JSON.parse(options.body));
      return json({});
    }));
    mount('flyout', 'gift-added');
    const attributes = { 'Free gift at $175': 'Harut point protectors, Set of 3', 'Free gift at $375': 'The Fencing Journal' };
    await vi.waitFor(() => expect(posts).toEqual([{ attributes }]));
    expect(refresh).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[data-gift-line]').length).toBe(2);
  });
});

describe('phone checkout bar', () => {
  it('opens the breakdown from Total and closes it on Escape or a tap behind it', () => {
    mount('flyout');
    const bar = document.querySelector('cart-checkout-bar');
    const toggle = bar.querySelector('[data-toggle-breakdown]');
    toggle.click();
    expect(bar.hasAttribute('data-open')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(bar.querySelector('.fc-bar__breakdown').hidden).toBe(false);
    bar.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
    expect(bar.hasAttribute('data-open')).toBe(false);
    toggle.click();
    document.querySelector('.fc-line__name').closest('.fc-line').click();
    expect(bar.hasAttribute('data-open')).toBe(false);
    expect(bar.querySelector('.fc-bar__breakdown').hidden).toBe(true);
  });
});
