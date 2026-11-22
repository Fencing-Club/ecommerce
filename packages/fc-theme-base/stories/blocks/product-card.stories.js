import { expect } from 'storybook/test';
import { products } from '../fixtures.js';
import { block } from '../liquid.js';

/** `blocks/product-card.liquid`: one chosen product, shown as the theme's product card. */
export default {
  title: 'Blocks/Product card',
  render: block('product-card'),
  args: { product: products[0], show_add: false },
  decorators: [(story) => `<div style="max-width: 300px">${story()}</div>`],
};

export const Product = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 3, name: 'Competition jacket' })).toBeVisible();
    await expect(canvas.getByText('$69.95')).toBeVisible();
  },
};
