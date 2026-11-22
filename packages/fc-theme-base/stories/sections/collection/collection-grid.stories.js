import { expect, waitFor } from 'storybook/test';
import { collectionFilters as f, collectionMenu, collectionPage } from '../../fixtures.js';
import { loadModule, section } from '../../liquid.js';

const filters = (on = {}) => [f.weapon(), f.protection(on.protection), f.fie(on.fie), f.hand(on.hand), f.size(on.size), f.color(), f.brand(), f.price(), f.availability()];
const globals = { linklists: collectionMenu.linklists, collections: collectionMenu.collections, routes: collectionMenu.routes };

/**
 * `sections/main-collection-product-grid.liquid`: the sticky toolbar, the filter panel, the filters in use, the grid
 * of product cards and Load more. When nothing matches it shows `snippets/collection-no-results.liquid`. Phones move
 * the filters into a drawer opened from the toolbar.
 */
export default {
  title: 'Sections/Collection/Product grid',
  parameters: { layout: 'fullscreen' },
  loaders: [loadModule('collection-page.js')],
  render: (args) => section('main-collection-product-grid', { variables: { collection: args.collection }, globals })(args),
  args: { collection: collectionPage({ filters: filters(), count: 137 }) },
};

export const Default = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('complementary', { name: 'Filters' })).toBeVisible();
    await expect(canvas.getByRole('heading', { level: 3, name: 'FIE 800N Competition Jacket' })).toBeVisible();
    await expect(canvas.getAllByRole('heading', { level: 3, name: 'Category' })[0]).toBeVisible();
    await expect(canvas.getAllByRole('status')[0]).toHaveTextContent('137 products');
  },
};

export const HideFilters = {
  play: async ({ canvas, userEvent }) => {
    const toggle = canvas.getByRole('button', { name: 'Hide filters' });
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(canvas.queryByRole('complementary', { name: 'Filters' })).toBeNull());
    await userEvent.click(canvas.getByRole('button', { name: 'Show filters' }));
    await expect(canvas.getByRole('complementary', { name: 'Filters' })).toBeVisible();
  },
};

export const ThreePerRow = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: '3 per row' }));
    await expect(canvas.getByRole('button', { name: '3 per row' })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvasElement.querySelector('[data-collection-layout]').style.getPropertyValue('--collection-columns')).toBe('3');
    await userEvent.click(canvas.getByRole('button', { name: '4 per row' }));
  },
};

export const NoResults = {
  args: { collection: collectionPage({ products: [], filters: filters({ size: ['3XL'], hand: ['Left-handed'], protection: ['800N'], fie: ['FIE'] }), count: 0 }) },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Remove Size 3XL' })).toBeVisible();
    await expect(canvas.getByRole('heading', { level: 2, name: 'No products match these filters' })).toBeVisible();
    await expect(canvas.getAllByRole('link', { name: 'Clear all filters' })[0]).toHaveAttribute('href', '/collections/clothing');
  },
};
