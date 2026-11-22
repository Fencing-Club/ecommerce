import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

const woodinville = { available: true, location: { address: { city: 'Woodinville', province_code: 'WA' } } };

/**
 * `snippets/product-stock-line.liquid`: where the chosen variant ships from. A variant Shopify lists as available at
 * our store ships from Woodinville; anything else in stock ships from the partner warehouse. Quick view's plain line
 * shows nothing once it's sold out. The product page's detailed line adds a dot, how many are left when few are, and
 * sold out. The product page's ships row is its own snippet, `product-ships-line`.
 */
export default {
  title: 'Components/Product stock line',
  render: snippet('product-stock-line'),
};

export const InOurStore = {
  args: { variant: { available: true, store_availabilities: [woodinville] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('In stock in Woodinville, WA')).toBeVisible();
  },
};

export const PartnerWarehouse = {
  args: { variant: { available: true, store_availabilities: [{ ...woodinville, available: false }] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Ships from our partner warehouse')).toBeVisible();
  },
};

export const SoldOut = {
  args: { variant: { available: false, store_availabilities: [woodinville] } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('p')).toBeNull();
  },
};

export const DetailedInOurStore = {
  args: { variant: { available: true, store_availabilities: [woodinville] }, detailed: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('In stock in Woodinville, WA')).toBeVisible();
  },
};

export const DetailedPartnerWarehouse = {
  args: { variant: { available: true, store_availabilities: [] }, detailed: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('In stock at our partner warehouse')).toBeVisible();
  },
};

export const DetailedLowStock = {
  args: {
    variant: { available: true, store_availabilities: [woodinville], inventory_management: 'shopify', inventory_policy: 'deny', inventory_quantity: 2 },
    detailed: true,
    size: '46',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Only 2 left in size 46')).toBeVisible();
  },
};

export const DetailedSoldOut = {
  args: { variant: { available: false, store_availabilities: [] }, detailed: true, size: '46' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Sold out in size 46')).toBeVisible();
  },
};
