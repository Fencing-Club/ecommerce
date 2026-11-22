import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

const woodinville = { available: true, location: { address: { city: 'Woodinville', province_code: 'WA' } } };

/**
 * `snippets/product-stock-line.liquid`: where the chosen variant ships from, in quick view and on the product page. A
 * variant Shopify lists as available at our store ships from Woodinville; anything else in stock ships from the
 * partner warehouse. Nothing shows once it's sold out.
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
