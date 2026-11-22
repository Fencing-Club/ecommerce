import { expect } from 'storybook/test';
import { collectionFilters as f, collectionMenu, collectionPage } from '../fixtures.js';
import { snippet } from '../liquid.js';

const render = snippet('collection-no-results', {
  stylesheets: ['section-main-collection.css'],
  globals: { linklists: collectionMenu.linklists, collections: collectionMenu.collections, routes: collectionMenu.routes },
});

/**
 * `snippets/collection-no-results.liquid`: what the grid shows when nothing is in it. With filters on, it offers
 * removing one of them or clearing them all, then the collection's best sellers; on the store `collection-page.js`
 * loads how many products each removal brings back and the best sellers. An empty collection points one level up.
 */
export default {
  title: 'Components/Collection no results',
  render,
  args: {
    results: collectionPage({ products: [], filters: [f.size(['3XL']), f.hand(['Left-handed']), f.protection(['800N']), f.fie(['FIE'])] }),
    section_id: 'story',
    clear_url: '/collections/clothing',
    contact_url: '/pages/contact',
  },
};

export const Filtered = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'No products match these filters' })).toBeVisible();
    await expect(canvas.getByText('Remove one to see more:')).toBeVisible();
    // Three suggestions at most.
    await expect(canvas.getByRole('link', { name: /Remove Size 3XL/ })).toHaveAttribute('href', '#remove-size-3xl');
    await expect(canvas.getByRole('link', { name: /Remove Left-handed/ })).toBeVisible();
    await expect(canvas.getByRole('link', { name: /Remove 800N/ })).toBeVisible();
    await expect(canvas.queryByRole('link', { name: /Remove FIE/ })).toBeNull();
    await expect(canvas.getByRole('link', { name: 'Clear all filters' })).toHaveAttribute('href', '/collections/clothing');
    await expect(canvas.getByRole('link', { name: 'Ask us to find it' })).toHaveAttribute('href', '/pages/contact');
  },
};

export const PriceFiltered = {
  args: { results: collectionPage({ products: [], filters: [f.availability(true), f.price(100)] }) },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: /Remove In stock only/ })).toBeVisible();
    // A price range is one filter to remove, however both ends are set.
    await expect(canvas.getByRole('link', { name: /Remove \$0 to \$1/ })).toHaveAttribute('href', '#remove-price');
  },
};

export const EmptyCollection = {
  args: { results: collectionPage({ handle: 'jackets', title: 'Jackets', products: [], filters: [f.size()] }) },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'Nothing here yet' })).toBeVisible();
    await expect(canvas.getByText('New gear for this collection is on its way.')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Shop all clothing' })).toHaveAttribute('href', '/collections/clothing');
    await expect(canvas.queryByRole('link', { name: 'Clear all filters' })).toBeNull();
  },
};
