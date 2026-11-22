import { expect, waitFor } from 'storybook/test';
import { assetUrl, loadModule, section } from '../../liquid.js';

const storageKey = 'fc:recently-viewed';
const products = {
  'aero-mask': { handle: 'aero-mask', title: 'Aero Mask 1600N FIE', url: '#aero-mask', price: 38900, featured_image: assetUrl('collection-aero-competition-jacket.jpg') },
  'grip-glove': { handle: 'grip-glove', title: 'Grip Fencing Glove', url: '#grip-glove', price: 3450, featured_image: assetUrl('collection-grip-fencing-glove.jpg') },
};

/** Stands in for Shopify's product JSON while a story runs, and puts the given handles in this browser's history. */
const history = (handles) => () => {
  const realFetch = window.fetch;
  window.fetch = async (url) => {
    const handle = String(url).match(/products\/([^.]+)\.js/)?.[1];
    return products[handle] ? new Response(JSON.stringify(products[handle])) : new Response('', { status: 404 });
  };
  localStorage.setItem(storageKey, JSON.stringify(handles));
  return () => {
    window.fetch = realFetch;
    localStorage.removeItem(storageKey);
  };
};

/**
 * `sections/recently-viewed.liquid` with `assets/recently-viewed.js`: the products this shopper looked at last, kept
 * in their browser and read from Shopify's product JSON so prices stay current. Hidden until there's one to show.
 */
export default {
  title: 'Sections/Collection/Recently viewed',
  parameters: { layout: 'fullscreen' },
  loaders: [loadModule('recently-viewed.js')],
  render: section('recently-viewed'),
};

export const Products = {
  beforeEach: history(['aero-mask', 'gone', 'grip-glove']),
  play: async ({ canvas, userEvent }) => {
    await waitFor(() => expect(canvas.getByRole('heading', { level: 2, name: 'Recently viewed' })).toBeVisible());
    await expect(canvas.getByRole('link', { name: /Aero Mask 1600N FIE/ })).toHaveAttribute('href', '#aero-mask');
    await expect(canvas.getByText('$389')).toBeVisible();
    await expect(canvas.getByText('$34.50')).toBeVisible();
    // A product that no longer exists drops out of the history.
    await expect(JSON.parse(localStorage.getItem(storageKey))).toEqual(['aero-mask', 'grip-glove']);
    await userEvent.click(canvas.getByRole('button', { name: 'Clear' }));
    await expect(canvas.queryByRole('heading', { name: 'Recently viewed' })).toBeNull();
    await expect(localStorage.getItem(storageKey)).toBeNull();
  },
};

export const NothingViewed = {
  beforeEach: history([]),
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('heading', { name: 'Recently viewed' })).toBeNull();
  },
};
