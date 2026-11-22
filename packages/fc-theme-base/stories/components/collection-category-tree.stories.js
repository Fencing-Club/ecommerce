import { expect } from 'storybook/test';
import { collectionMenu, collectionPage } from '../fixtures.js';
import { loadModule, snippet } from '../liquid.js';

const render = snippet('collection-category-tree', {
  stylesheets: ['section-main-collection.css'],
  globals: { linklists: collectionMenu.linklists, collections: collectionMenu.collections, routes: collectionMenu.routes },
});

/**
 * `snippets/collection-category-tree.liquid`: where a collection sits in the main menu. As tiles it lists the
 * categories under the collection; as a tree, the whole branch opened down to it. Empty categories drop out, and
 * counts and photos come from the collection each menu item links to.
 */
export default {
  title: 'Components/Collection category tree',
  loaders: [loadModule('collection-page.js')],
  render: (args) => `<div style="max-width: ${args.style === 'tree' ? '24rem' : 'none'}">${render(args)}</div>`,
  args: { collection: collectionPage(), style: 'tree', id_prefix: 'story' },
};

export const Tree = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'All equipment' })).toHaveAttribute('href', '/collections/all');
    await expect(canvas.getByRole('link', { name: /^Clothing\s+137 products$/ })).toHaveAttribute('aria-current', 'page');
    await expect(canvas.getByRole('link', { name: /^Jackets\s+24 products$/ })).toBeVisible();
    // An empty category drops out.
    await expect(canvas.queryByRole('link', { name: /Lames/ })).toBeNull();
  },
};

export const OpenBranch = {
  play: async ({ canvas, userEvent }) => {
    const toggle = canvas.getByRole('button', { name: 'Jackets' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.queryByRole('link', { name: /^Men's\s+11 products$/ })).toBeNull();
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getByRole('link', { name: /^Men's\s+11 products$/ })).toBeVisible();
  },
};

export const OnSubcategory = {
  args: { collection: collectionPage({ handle: 'jackets', title: 'Jackets' }) },
  play: async ({ canvas }) => {
    // The branch opens down to the collection on the page.
    await expect(canvas.getByRole('link', { name: /^Jackets\s+24 products$/ })).toHaveAttribute('aria-current', 'page');
    await expect(canvas.getByRole('button', { name: 'Jackets' })).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getByRole('link', { name: /^Women's\s+9 products$/ })).toBeVisible();
  },
};

export const Tiles = {
  args: { style: 'tiles' },
  play: async ({ canvas }) => {
    const nav = canvas.getByRole('navigation', { name: 'Clothing categories' });
    await expect(nav).toBeVisible();
    await expect(canvas.getByRole('link', { name: /Jackets/ })).toHaveAttribute('href', '/collections/jackets');
    await expect(canvas.getByText('24 products')).toBeVisible();
    await expect(canvas.queryByRole('link', { name: /Lames/ })).toBeNull();
  },
};

export const ShopParent = {
  args: { collection: collectionPage({ handle: 'jackets', title: 'Jackets' }), style: 'parent' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Shop all clothing' })).toHaveAttribute('href', '/collections/clothing');
  },
};

export const NotInMenu = {
  args: { collection: collectionPage({ handle: 'sale', title: 'Sale' }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.collection-tree')).toBeNull();
  },
};

export const ProductBreadcrumbs = {
  args: {
    collection: null,
    style: 'breadcrumbs',
    home_label: 'Home',
    product: {
      title: 'Novus Mens Jacket 350N',
      collections: [{ url: '/collections/clothing' }, { url: '/collections/jackets' }, { url: '/collections/mens-jackets' }, { url: '/collections/sale' }],
    },
  },
  play: async ({ canvas }) => {
    // The deepest menu collection holding the product leads to it.
    await expect(canvas.getByRole('link', { name: 'Clothing' })).toHaveAttribute('href', '/collections/clothing');
    await expect(canvas.getByRole('link', { name: 'Jackets' })).toHaveAttribute('href', '/collections/jackets');
    await expect(canvas.getByRole('link', { name: "Men's" })).toHaveAttribute('href', '/collections/mens-jackets');
    await expect(canvas.getByText('Novus Mens Jacket 350N')).toHaveAttribute('aria-current', 'page');
  },
};
