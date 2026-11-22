import { expect, within } from 'storybook/test';
import { collectionMenu, collectionPage } from '../../fixtures.js';
import { loadModule, section } from '../../liquid.js';

const trust = (id, icon, text) => ({ id, type: 'trust', settings: { icon, text } });
// Free shipping takes its minimum from the theme settings, as the cart does.
const freeShipping = { id: 'shipping', type: 'trust', settings: { content: 'free_shipping', icon: 'truck' } };
const blocks = [freeShipping, trust('stock', 'package-check', 'In stock and packed by our team'), trust('clubs', 'users', 'Club and team pricing')];
// A US shopper paying in dollars, who gets free shipping.
const usStore = { shop: { currency: 'USD' }, cart: { currency: { iso_code: 'USD', symbol: '$' } } };
const menu = { linklists: collectionMenu.linklists, collections: collectionMenu.collections, routes: collectionMenu.routes };

/**
 * `sections/main-collection-banner.liquid`: the collection's breadcrumbs, title and description, a link down to the
 * buying guide, the trust lines and the categories under it. The breadcrumbs and categories come from the main menu.
 * A free shipping trust line reads its minimum from the theme settings and shows only to shoppers who get free
 * shipping. Phones cut the description to three lines with Read more and show the categories as a row of pills.
 */
export default {
  title: 'Sections/Collection/Hero',
  parameters: { layout: 'fullscreen' },
  loaders: [loadModule('collection-page.js')],
  render: section('main-collection-banner', {
    sectionBlocks: blocks,
    variables: { collection: collectionPage({ title: 'Fencing clothing' }) },
    globals: { ...menu, ...usStore },
  }),
};

export const Default = {
  play: async ({ canvas }) => {
    // The breadcrumbs name the collection as the menu does.
    await expect(canvas.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Clothing');
    await expect(canvas.getByText('Free US shipping over $375')).toBeVisible();
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

/** A collection three levels down the menu gets every level above it. */
export const DeepInTheMenu = {
  render: section('main-collection-banner', {
    sectionBlocks: blocks,
    variables: { collection: collectionPage({ handle: 'mens-jackets', title: "Men's fencing jackets" }) },
    globals: { ...menu, ...usStore },
  }),
  play: async ({ canvas }) => {
    const breadcrumbs = within(canvas.getByRole('navigation', { name: 'Breadcrumb' }));
    await expect(breadcrumbs.getByRole('link', { name: 'Clothing' })).toHaveAttribute('href', '/collections/clothing');
    await expect(breadcrumbs.getByRole('link', { name: 'Jackets' })).toHaveAttribute('href', '/collections/jackets');
    await expect(breadcrumbs.getByText("Men's")).toHaveAttribute('aria-current', 'page');
  },
};

export const OutsideTheUs = {
  render: section('main-collection-banner', {
    sectionBlocks: blocks,
    variables: { collection: collectionPage({ title: 'Fencing clothing' }) },
    globals: { ...menu, ...usStore, localization: { country: { iso_code: 'CA', name: 'Canada', currency: { iso_code: 'CAD', symbol: '$' } } } },
  }),
  play: async ({ canvas }) => {
    await expect(canvas.queryByText(/Free US shipping/)).toBeNull();
    await expect(canvas.getByText('Club and team pricing')).toBeVisible();
  },
};
