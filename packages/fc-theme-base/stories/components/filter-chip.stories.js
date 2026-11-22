import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

/**
 * `snippets/ui-filter-chip.liquid`: a filter in use, with an x that removes it. Active filters use the small size; the
 * no-results panel uses the large one, with how many products removing the filter brings back.
 */
export default {
  title: 'Components/Filter chip',
  render: snippet('ui-filter-chip'),
  args: { label: 'Size 3XL', url: '/collections/clothing' },
};

export const Small = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Remove Size 3XL' })).toHaveAttribute('href', '/collections/clothing');
  },
};

/** The count starts empty and `collection-page.js` fills it in; it's part of the link's name. */
export const WithCount = {
  args: { size: 'md', with_count: true },
  play: async ({ canvas, canvasElement }) => {
    canvasElement.querySelector('[data-filter-chip-count]').textContent = '14 products';
    await expect(canvas.getByRole('link', { name: 'Remove Size 3XL 14 products' })).toBeVisible();
  },
};
