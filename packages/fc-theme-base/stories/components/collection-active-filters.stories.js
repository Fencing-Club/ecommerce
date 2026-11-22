import { expect } from 'storybook/test';
import { collectionFilters as f, collectionPage } from '../fixtures.js';
import { snippet } from '../liquid.js';

/**
 * `snippets/collection-active-filters.liquid`: the filters in use over the grid, each a chip that removes it, then
 * Clear all. Sizes say Size first so a bare 3XL isn't a puzzle.
 */
export default {
  title: 'Components/Collection active filters',
  render: snippet('collection-active-filters', { stylesheets: ['section-main-collection.css'] }),
  args: {
    results: collectionPage({ filters: [f.size(['3XL']), f.hand(['Left-handed']), f.protection(['800N']), f.fie(['FIE']), f.price(20000)] }),
    clear_url: '/collections/clothing',
  },
};

export const Default = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Remove Size 3XL' })).toHaveAttribute('href', '#remove-size-3xl');
    await expect(canvas.getByRole('link', { name: 'Remove Left-handed' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Remove 800N' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Remove $0 to $200' })).toHaveAttribute('href', '#remove-price');
    await expect(canvas.getByRole('link', { name: 'Clear all' })).toHaveAttribute('href', '/collections/clothing');
  },
};

export const NoneInUse = {
  args: { results: collectionPage({ filters: [f.size(), f.hand()] }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.collection-active-filters')).toBeNull();
  },
};
