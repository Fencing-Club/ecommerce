import { expect } from 'storybook/test';
import { products, sectionHeader } from '../fixtures.js';
import { loadScript, section } from '../liquid.js';

/** `sections/best-sellers.liquid`: chosen products in a row of four. Each card is a `product-card` block. */
export default {
  title: 'Sections/Best sellers',
  parameters: { layout: 'fullscreen' },
  loaders: [loadScript('product-form.js')],
  render: section('best-sellers', {
    staticBlocks: [sectionHeader('Featured products', 'Best sellers', { label: 'View all', link: '#all' })],
    blocks: products.map((product) => ({ id: `card-${product.id}`, type: 'product-card', settings: { product, badge: 'Best seller', show_add: true } })),
  }),
};

export const Products = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'Best sellers' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '#all');
    await expect(canvas.getByRole('heading', { level: 3, name: 'Competition jacket' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Fencing glove, Best seller' })).toHaveAttribute('href', '#product-802');
  },
};
