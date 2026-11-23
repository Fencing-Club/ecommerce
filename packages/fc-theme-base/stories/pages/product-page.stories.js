import { expect, waitFor } from 'storybook/test';
import { articles, detailsJacket, detailsParts, kitPieces, productPageProduct, sectionHeader } from '../fixtures.js';
import { assetUrl, loadModule, section } from '../liquid.js';
import footer from '../sections/footer/footer.stories.js';
import header from '../sections/header/header.stories.js';
import mainProduct from '../sections/product/main-product.stories.js';
import productDetails from '../sections/product/product-details.stories.js';

// The product with every part's data: the main product story's options and stock with the details story's specs,
// care, questions and reviews, plus a kit and linked Journal articles.
const product = () => {
  const main = productPageProduct(9204);
  return {
    ...main,
    metafields: {
      ...detailsJacket.metafields,
      custom: { ...detailsJacket.metafields.custom, ...main.metafields.custom, kit: { value: kitPieces }, articles: { value: articles } },
      reviews: main.metafields.reviews,
    },
  };
};

const storageKey = 'fc:recently-viewed';
const viewed = {
  'grip-glove': { handle: 'grip-glove', title: 'Grip Fencing Glove', url: '#grip-glove', price: 3450, featured_image: assetUrl('collection-grip-fencing-glove.jpg') },
};

/** Puts a product in this browser's history and answers Shopify's product JSON for it while the story runs. */
const recentlyViewed = () => {
  const storeFetch = window.fetch;
  window.fetch = async (input, init) => {
    const handle = String(input instanceof Request ? input.url : input).match(/products\/([^.?]+)\.js/)?.[1];
    if (handle) return viewed[handle] ? new Response(JSON.stringify(viewed[handle])) : new Response('', { status: 404 });
    return storeFetch(input, init);
  };
  localStorage.setItem(storageKey, JSON.stringify(Object.keys(viewed)));
  return () => {
    window.fetch = storeFetch;
    localStorage.removeItem(storageKey);
  };
};

/**
 * The product page as `templates/product.json` stacks it, between the header and footer: the buy box with Complete
 * the kit, then Overview, Specs, Care, Reviews and Questions, From the Journal and Recently viewed. Related products
 * loads Shopify's recommendations from the store, so it isn't here.
 */
export default {
  title: 'Pages/Product page',
  parameters: { layout: 'fullscreen' },
  loaders: [...(mainProduct.loaders ?? []), ...(productDetails.loaders ?? []), loadModule('recently-viewed.js')],
  beforeEach: recentlyViewed,
  render: () =>
    [
      header.render(header.args),
      mainProduct.render({ variant: 9204, kit: kitPieces }),
      section('product-details', { blocks: detailsParts, variables: { product: product(), pages: { contact: { url: '/pages/contact' } } } })({}),
      section('journal-highlights', {
        staticBlocks: [sectionHeader(null, 'From the Journal', { label: 'View all', link: '#journal' })],
        variables: { product: product() },
      })({ source: 'product', read_label: 'Read more' }),
      section('recently-viewed')({ limit: 6 }),
      footer.render({}),
    ].join(''),
};

export const EveryPart = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Novus Underarm Protector 350N' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Add 3 to cart, $179.95' })).toBeVisible();
    await expect(canvas.getByRole('navigation', { name: 'On this page' })).toBeVisible();
    await expect(canvas.getByRole('heading', { level: 2, name: 'From the Journal' })).toBeVisible();
    await waitFor(() => expect(canvas.getByRole('heading', { level: 2, name: 'Recently viewed' })).toBeVisible());
    await expect(canvas.getByRole('contentinfo')).toBeVisible();
  },
};
