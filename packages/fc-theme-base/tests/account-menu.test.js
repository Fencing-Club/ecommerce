import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Liquid } from 'liquidjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../assets/account-menu.js';

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
engine.registerFilter('asset_url', name => `/assets/${name}`);
engine.registerFilter('stylesheet_tag', url => `<link rel="stylesheet" href="${url}">`);

const routes = { account_url: '/account', account_login_url: '/account/login', account_profile_url: '/account/profile', account_logout_url: '/account/logout' };
const alex = { first_name: 'Alex', name: 'Alex Morgan', email: 'alex@example.com' };

function mount(customer) {
  const template = document.createElement('template');
  template.innerHTML = `<div class="header__icons">${engine.renderFileSync('account-menu', {}, { globals: { routes, customer } })}<a class="header__icon header__icon--cart" href="/cart"><span class="svg-wrapper"></span></a></div>`;
  template.content.querySelectorAll('link, script').forEach(element => element.remove());
  const row = template.content.firstElementChild;
  const menu = row.querySelector('account-menu');
  const dialog = menu.querySelector('dialog');
  dialog.showModal = vi.fn(() => { dialog.open = true; });
  dialog.close = vi.fn(() => { dialog.open = false; });
  document.body.append(row);
  return {
    menu, dialog, row,
    trigger: menu.querySelector('[data-account-open]'),
    panel: menu.querySelector('[data-account-panel]'),
    backdrop: menu.querySelector('[data-account-backdrop]'),
    close: menu.querySelector('[data-account-close]'),
  };
}

const settle = () => new Promise(done => setTimeout(done));
const click = (element, init = {}) => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }));
const text = element => element?.textContent.replace(/\s+/g, ' ').trim();
let motion;
let phone;

beforeEach(() => {
  motion = { matches: true };
  phone = { matches: false };
  vi.stubGlobal('matchMedia', vi.fn(query => (query.includes('reduced-motion') ? motion : phone)));
  document.body.style.cssText = '';
});
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('account menu markup', () => {
  it('offers Shopify sign-in to a signed-out shopper, with no Shop button or email field', () => {
    const { menu, trigger, dialog } = mount(undefined);
    expect(trigger.getAttribute('href')).toBe('/account/login');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-controls')).toBe(dialog.id);
    expect(trigger.getAttribute('aria-label')).toBe('customer.account_menu.label');
    expect(dialog.getAttribute('aria-labelledby')).toBe(`${dialog.id}-Title`);
    expect(text(menu.querySelector(`#${dialog.id}-Title`))).toBe('customer.account_menu.title');
    expect(text(menu.querySelector('.account-menu__text'))).toBe('customer.account_menu.benefit');
    const signIn = menu.querySelector('.account-menu__sign-in');
    expect(signIn.getAttribute('href')).toBe('/account/login');
    expect(text(signIn)).toBe('customer.account_menu.sign_in');
    expect(menu.querySelector('input, shopify-account, .account-menu__links')).toBeNull();
  });

  it('shows who is signed in with their orders, profile and sign out', () => {
    const { menu, trigger, dialog } = mount(alex);
    expect(trigger.getAttribute('href')).toBe('/account');
    expect(text(menu.querySelector(`#${dialog.id}-Title`))).toBe('Alex Morgan');
    expect(text(menu.querySelector('.account-menu__email'))).toBe('alex@example.com');
    expect(text(menu.querySelector('.account-menu__avatar'))).toBe('A');
    expect(menu.querySelector('.account-menu__avatar').getAttribute('aria-hidden')).toBe('true');
    expect([...menu.querySelectorAll('.account-menu__link')].map(link => [text(link), link.getAttribute('href')])).toEqual([
      ['customer.account_menu.orders', '/account'],
      ['customer.account_menu.profile', '/account/profile'],
      ['customer.account_menu.sign_out', '/account/logout'],
    ]);
    expect(menu.querySelector('.account-menu__sign-in')).toBeNull();
  });

  it('keeps the empty scrim visible alongside Dawn styles', async () => {
    const styles = document.createElement('style');
    styles.textContent = (await Promise.all(['base.css', 'component-account-menu.css'].map(file => readFile(resolve('assets', file), 'utf8')))).join('\n');
    document.head.append(styles);
    try {
      const { backdrop } = mount(undefined);
      expect(getComputedStyle(backdrop).display).toBe('block');
    } finally {
      styles.remove();
    }
  });

  it('falls back to the email when the shopper has no name', () => {
    const { menu, dialog } = mount({ first_name: '', name: ' ', email: 'sam@example.com' });
    expect(text(menu.querySelector(`#${dialog.id}-Title`))).toBe('sam@example.com');
    expect(menu.querySelector('.account-menu__email')).toBeNull();
    expect(text(menu.querySelector('.account-menu__avatar'))).toBe('S');
  });
});

describe('account menu behavior', () => {
  it('opens on a plain click and focuses close, then returns focus on close', async () => {
    const { trigger, dialog, close } = mount(alex);
    trigger.focus();
    expect(click(trigger)).toBe(false);
    click(trigger);
    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(close);
    click(close);
    await settle();
    expect(dialog.open).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('leaves the page scrolling under the popover', () => {
    const { trigger } = mount(alex);
    click(trigger);
    expect(document.body.style.overflow).toBe('');
  });

  it('locks page scroll under the phone sheet, then restores it on close', async () => {
    phone.matches = true;
    document.body.style.setProperty('overflow', 'auto', 'important');
    const { trigger, close } = mount(alex);
    click(trigger);
    expect(document.body.style.overflow).toBe('hidden');
    click(close);
    await settle();
    expect(document.body.style.overflow).toBe('auto');
    expect(document.body.style.getPropertyPriority('overflow')).toBe('important');
  });

  it('follows the link on a modified click or without dialog support', () => {
    const { trigger, dialog } = mount(undefined);
    expect(click(trigger, { metaKey: true })).toBe(true);
    expect(dialog.showModal).not.toHaveBeenCalled();
    dialog.showModal = undefined;
    expect(click(trigger)).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on Escape and on a tap outside, but not on a drag that ends outside', async () => {
    const { trigger, dialog, panel, backdrop } = mount(alex);
    click(trigger);
    const escape = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    await settle();
    expect(dialog.open).toBe(false);

    click(trigger);
    panel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    click(backdrop);
    await settle();
    expect(dialog.open).toBe(true);
    backdrop.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    click(backdrop);
    await settle();
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('releases the page when the browser closes the dialog itself', () => {
    phone.matches = true;
    const { trigger, dialog } = mount(alex);
    click(trigger);
    dialog.open = false;
    dialog.dispatchEvent(new Event('close'));
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.body.style.overflow).toBe('');
  });

  it('puts the popover under the account link with its end edge on the cart icon', () => {
    const { trigger, dialog, row } = mount(undefined);
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1440);
    trigger.getBoundingClientRect = () => ({ top: 120, bottom: 164, left: 1240, right: 1284 });
    row.querySelector('.header__icon--cart .svg-wrapper').getBoundingClientRect = () => ({ top: 131, bottom: 153, left: 1320, right: 1342 });
    click(trigger);
    expect(dialog.style.getPropertyValue('--account-menu-top')).toBe('172px');
    expect(dialog.style.getPropertyValue('--account-menu-end')).toBe('98px');
  });

  it('keeps the popover under the account link as the page scrolls', () => {
    const { trigger, dialog } = mount(undefined);
    trigger.getBoundingClientRect = () => ({ top: 120, bottom: 164, left: 1240, right: 1284 });
    click(trigger);
    trigger.getBoundingClientRect = () => ({ top: 20, bottom: 64, left: 1240, right: 1284 });
    window.dispatchEvent(new Event('scroll'));
    expect(dialog.style.getPropertyValue('--account-menu-top')).toBe('72px');
  });

  it('leaves phones to the bottom sheet', () => {
    phone.matches = true;
    const { trigger, dialog } = mount(undefined);
    click(trigger);
    expect(dialog.style.getPropertyValue('--account-menu-top')).toBe('');
  });

  it('fades the popover in from above and slides the phone sheet up over a fading scrim', async () => {
    motion.matches = false;
    const runs = [];
    HTMLElement.prototype.animate = vi.fn(function (frames, options) {
      const animation = { finished: Promise.resolve(), cancel: vi.fn() };
      runs.push({ element: this, frames, options, animation });
      return animation;
    });
    try {
      const desktop = mount(undefined);
      click(desktop.trigger);
      expect(runs.map(run => [run.element, run.frames])).toEqual([
        [desktop.panel, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'translateY(0)' }]],
      ]);
      expect(runs[0].options).toMatchObject({ duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
      await settle();
      // Opening lets go of its animation, so the panel rests on its own styles.
      expect(runs[0].animation.cancel).toHaveBeenCalled();
      click(desktop.close);
      expect(desktop.dialog.open).toBe(true);
      expect(runs[1].frames[1]).toEqual({ opacity: 0, transform: 'translateY(-6px)' });
      await settle();
      expect(desktop.dialog.open).toBe(false);

      runs.length = 0;
      phone.matches = true;
      const sheet = mount(alex);
      click(sheet.trigger);
      expect(runs.map(run => [run.element, run.frames])).toEqual([
        [sheet.panel, [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }]],
        [sheet.backdrop, [{ opacity: 0 }, { opacity: 1 }]],
      ]);
    } finally {
      delete HTMLElement.prototype.animate;
    }
  });

  it('reopens cleanly when clicked again while closing', async () => {
    motion.matches = false;
    let finishClose;
    HTMLElement.prototype.animate = vi.fn((frames) => ({
      finished: frames[1].opacity === 0 ? new Promise(done => { finishClose = done; }) : Promise.resolve(),
      cancel: vi.fn(),
    }));
    try {
      const { trigger, dialog, close } = mount(undefined);
      click(trigger);
      await settle();
      click(close);
      click(trigger);
      finishClose();
      await new Promise(done => setTimeout(done, 400));
      expect(dialog.open).toBe(true);
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
    } finally {
      delete HTMLElement.prototype.animate;
    }
  });
});
