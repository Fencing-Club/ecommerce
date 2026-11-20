import { expect } from 'storybook/test';
import { image, sectionHeader } from '../../fixtures.js';
import { section } from '../../liquid.js';

const category = (id, title, file, count) => ({
  id,
  type: '_category-card',
  settings: { collection: { title, url: `#${id}`, all_products_count: count, featured_image: image(file, title) }, link_label: 'Shop' },
});

/** `sections/category-grid.liquid`: collections to shop by. Each card is a `_category-card` block. */
export default {
  title: 'Sections/Home/Category grid',
  parameters: { layout: 'fullscreen' },
  render: section('category-grid', {
    staticBlocks: [sectionHeader('Browse the range', 'Shop by category')],
    blocks: [
      category('jackets', 'Jackets', 'collection-fie-800n-jacket.jpg', 24),
      category('gloves', 'Gloves', 'collection-grip-fencing-glove.jpg', 1),
      category('pants', 'Pants', 'collection-knicker-pants-350n.jpg', 9),
    ],
  }),
};

export const Categories = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'Shop by category' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Jackets' })).toHaveAttribute('href', '#jackets');
    await expect(canvas.getByText('24 items')).toBeVisible();
    await expect(canvas.getByText('1 item')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Shop Gloves' })).toHaveAttribute('href', '#gloves');
  },
};
