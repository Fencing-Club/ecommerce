import { expect } from 'storybook/test';
import { assetUrl, renderLiquid, settings } from '../liquid.js';

// Temporary: compares today's value with shadcn's for the token decisions still open. Each column renders the real
// snippets; the second column only overrides the token, or the one rule, being compared. Remove once decided.

const column = (title, value, style, body) =>
  `<section class="token-choice" style="${style}"><h3>${title}</h3><p class="token-choice__value">${value}</p>${body}</section>`;

const compare = (today, shadcn, body, stylesheets = []) =>
  `${stylesheets.map((file) => `<link rel="stylesheet" href="${assetUrl(file)}">`).join('')}
  <style>
    .token-choices { display: grid; grid-template-columns: repeat(2, minmax(0, 42rem)); gap: 4rem; }
    .token-choice { display: flex; flex-direction: column; gap: 1.6rem; }
    .token-choice h3 { margin: 0; font-size: 1.6rem; color: var(--foreground); }
    .token-choice__value { margin: -1.2rem 0 0; font-size: 1.3rem; color: var(--muted-foreground); }
  </style>
  <div class="token-choices">${column('Today', today.value, today.style ?? '', body('today'))}${column('shadcn', shadcn.value, shadcn.style, body('shadcn'))}</div>`;

/** Open token decisions, each shown with the real components: today's value beside shadcn's. */
export default { title: 'Foundations/Token choices' };

export const DestructiveRed = {
  name: 'Destructive red',
  render: () =>
    compare({ value: '#B42318' }, { value: '#E7000B (red-600)', style: '--destructive: #e7000b;' }, (key) =>
      [
        renderLiquid('ui-text-field', { id: `Email-${key}`, name: 'email', label: 'Email', type: 'email', value: 'jordan@', invalid: true }),
        renderLiquid('ui-checkbox-field', { id: `Terms-${key}`, name: 'terms', label: 'I agree to the terms', invalid: true }),
      ].join(''),
    ),
  play: async ({ canvas }) => {
    for (const input of canvas.getAllByRole('textbox', { name: 'Email' })) await expect(input).toHaveAttribute('aria-invalid', 'true');
  },
};

export const ButtonHeight = {
  name: 'Button height',
  render: () =>
    compare(
      { value: '44px' },
      { value: '36px (h-9)', style: '' },
      (key) =>
        `${key === 'shadcn' ? '<style>.token-choice--h9 .ui-button { min-height: 3.6rem; }</style>' : ''}<div class="${key === 'shadcn' ? 'token-choice--h9' : ''}" style="display:flex;gap:1.2rem;flex-wrap:wrap">${[
          renderLiquid('ui-button', { label: 'Add to cart', variant: 'primary' }),
          renderLiquid('ui-button', { label: 'Continue shopping', variant: 'secondary' }),
        ].join('')}</div>`,
    ),
  play: async ({ canvas }) => {
    const [today, shadcn] = canvas.getAllByRole('button', { name: 'Add to cart' });
    await expect(today.getBoundingClientRect().height).toBe(44);
    await expect(shadcn.getBoundingClientRect().height).toBe(36);
  },
};

const gift = (minimum) => ({ minimum_total: { value: minimum }, available: { value: true } });
const rewardGlobals = {
  cart: { items: [{}], item_count: 1, total_price: 33300, currency: { iso_code: 'USD' } },
  shop: { currency: 'USD', metaobjects: { cart_gift: { values: [gift(175), gift(275)] } } },
  localization: { country: { iso_code: 'US' } },
  settings: { ...settings, cart_free_shipping_threshold: 375 },
};

export const RewardGreen = {
  name: 'Reward green',
  render: () =>
    compare(
      { value: '#216B43 (custom)' },
      { value: '#008236 (green-700)', style: '--cart-benefit: #008236; --cart-benefit-surface: #f0fdf4;' },
      () => `<div class="fc-cart-panel">${renderLiquid('cart-reward-progress', {}, rewardGlobals)}</div>`,
      ['cart-experience.css'],
    ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('.fc-progress')).toHaveLength(2);
  },
};
