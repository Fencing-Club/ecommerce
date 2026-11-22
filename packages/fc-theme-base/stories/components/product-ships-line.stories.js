import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

const woodinville = { available: true, location: { address: { city: 'Woodinville', province_code: 'WA' } } };

// The product section's Shipping settings, as its schema sets them.
const dispatch = { cutoff_hour: 14, transit_min: 2, transit_max: 5, partner_min: 1, partner_max: 2 };

const row = snippet('product-ships-line', { stylesheets: ['section-main-product.css'] });

/**
 * `snippets/product-ships-line.liquid`: the product page's ships row, first among its trust notes. These show the row
 * as Liquid renders it, before the product page's script counts down to the cutoff and adds arrival dates; the main
 * product stories cover those.
 */
export default {
  title: 'Components/Product ships line',
  render: (args) => `<ul class="product-page__trust list-unstyled">${row(args)}</ul>`,
  args: { dispatch },
};

export const Woodinville = {
  args: { variant: { available: true, store_availabilities: [woodinville] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('listitem')).toHaveTextContent('Ships within one business day');
  },
};

export const PartnerWarehouse = {
  args: { variant: { available: true, store_availabilities: [] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('listitem')).toHaveTextContent('Ships in 1 to 2 business days');
  },
};

export const SoldOut = {
  args: { variant: { available: false, store_availabilities: [woodinville] } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('listitem')).toBeNull();
  },
};
