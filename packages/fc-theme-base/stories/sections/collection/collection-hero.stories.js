import { expect } from 'storybook/test';
import { collectionMenu, collectionPage } from '../../fixtures.js';
import { loadModule, section } from '../../liquid.js';

const trust = (id, icon, text) => ({ id, type: 'trust', settings: { icon, text } });

/**
 * `sections/main-collection-banner.liquid`: the collection's breadcrumb, title and description, a link down to the
 * buying guide, the trust lines and the categories under it from the main menu. Phones cut the description to three
 * lines with Read more and show the categories as a row of pills.
 */
export default {
  title: 'Sections/Collection/Hero',
  parameters: { layout: 'fullscreen' },
  loaders: [loadModule('collection-page.js')],
  render: section('main-collection-banner', {
    sectionBlocks: [
      trust('shipping', 'truck', 'Free US shipping over $375'),
      trust('stock', 'package-check', 'In stock and packed by our team'),
      trust('clubs', 'users', 'Club and team pricing'),
    ],
    variables: { collection: collectionPage({ title: 'Fencing clothing' }) },
    globals: { linklists: collectionMenu.linklists, collections: collectionMenu.collections, routes: collectionMenu.routes },
  }),
};

export const Default = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Fencing clothing');
    await expect(canvas.getByRole('heading', { level: 1, name: 'Fencing clothing' })).toBeVisible();
    await expect(canvas.getByText(/from 350N club kit to 800N FIE/)).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'How to choose fencing clothing' })).toHaveAttribute('href', '#BuyingGuide');
    await expect(canvas.getByText('Club and team pricing')).toBeVisible();
    // The collection isn't in the story's menu under this title's handle, so its menu branch is Clothing's.
    await expect(canvas.getByRole('navigation', { name: 'Clothing categories' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: /Gloves/ })).toHaveAttribute('href', '/collections/gloves');
  },
};

export const NoCategories = {
  args: { show_categories: false, show_guide: false },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('navigation', { name: 'Clothing categories' })).toBeNull();
    await expect(canvas.queryByRole('link', { name: /How to choose/ })).toBeNull();
  },
};
