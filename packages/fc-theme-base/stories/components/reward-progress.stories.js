import { expect } from 'storybook/test';
import { settings, snippet } from '../liquid.js';

// The store's rewards: a gift at $175 and at $275, and free US shipping at $375.
const gift = (name, minimum) => ({ name: { value: name }, minimum_total: { value: minimum }, available: { value: true } });
const shop = {
  currency: 'USD',
  metaobjects: { cart_gift: { values: [gift('Harut point protectors', 175), gift('The Fencing Journal', 275)] } },
};

/**
 * `snippets/cart-reward-progress.liquid`: progress towards the cart's free gifts and free shipping, above the cart
 * lines. `total` is the cart total in cents.
 */
export default {
  title: 'Components/Reward progress',
  render: snippet('cart-reward-progress', {
    stylesheets: ['cart-experience.css'],
    globals: ({ total }) => ({
      shop,
      settings: { ...settings, cart_free_shipping_threshold: 375 },
      cart: { total_price: total, item_count: 1, items: [{}], currency: { iso_code: 'USD', symbol: '$' } },
    }),
  }),
  decorators: [(story) => `<div style="max-width: 56rem">${story()}</div>`],
  args: { total: 4000 },
};

export const Start = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/away from a free gift/)).toHaveTextContent('$135.00 away from a free gift');
    await expect(canvas.getByText('$175')).toBeVisible();
    await expect(canvas.getByText('$375')).toBeVisible();
  },
};

export const GiftUnlocked = {
  args: { total: 20000 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/away from another free gift/)).toHaveTextContent('$75.00 away from another free gift');
    await expect(canvas.getByText('Free gift unlocked')).toBeInTheDocument();
  },
};

export const NearFreeShipping = {
  args: { total: 30000 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/away from free US shipping/)).toHaveTextContent('$75.00 away from free US shipping');
  },
};

export const AllUnlocked = {
  args: { total: 40000 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Every reward unlocked')).toBeVisible();
  },
};
