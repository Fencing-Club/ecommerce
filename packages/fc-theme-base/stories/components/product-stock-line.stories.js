import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

const woodinville = { available: true, location: { address: { city: 'Woodinville', province_code: 'WA' } } };

// The product section's Shipping settings, as its schema sets them.
const dispatch = { cutoff_hour: 14, transit_min: 2, transit_max: 5, partner_min: 1, partner_max: 2 };

/**
 * `snippets/product-stock-line.liquid`: where the chosen variant ships from. A variant Shopify lists as available at
 * our store ships from Woodinville; anything else in stock ships from the partner warehouse. Quick view's plain line
 * shows nothing once it's sold out. The product page's detailed line adds a dot, how many are left when few are, sold
 * out, and the ships line, which counts down to the cutoff once the product page's script runs.
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
  args: { variant: { available: true, store_availabilities: [woodinville] }, detailed: true, dispatch },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('In stock in Woodinville, WA')).toBeVisible();
    await expect(canvas.getByText('Ships within one business day.')).toBeVisible();
  },
};

export const DetailedPartnerWarehouse = {
  args: { variant: { available: true, store_availabilities: [] }, detailed: true, dispatch },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('In stock at our partner warehouse')).toBeVisible();
    await expect(canvas.getByText('Ships in 1 to 2 business days.')).toBeVisible();
  },
};

export const DetailedLowStock = {
  args: {
    variant: { available: true, store_availabilities: [woodinville], inventory_management: 'shopify', inventory_policy: 'deny', inventory_quantity: 2 },
    detailed: true,
    size: '46',
    dispatch,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Only 2 left in size 46')).toBeVisible();
  },
};

export const DetailedSoldOut = {
  args: { variant: { available: false, store_availabilities: [] }, detailed: true, size: '46', dispatch },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Sold out in size 46')).toBeVisible();
    await expect(canvas.queryByText(/^Ships/)).toBeNull();
  },
};
