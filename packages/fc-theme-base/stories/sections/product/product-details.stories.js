import { expect, within } from 'storybook/test';
import { detailsJacket, detailsParts } from '../../fixtures.js';
import { loadModule, loadStylesheet, section } from '../../liquid.js';

const jacket = detailsJacket;
const allParts = detailsParts;
const [knickers, protector] = jacket.metafields['shopify--discovery--product_recommendation'].complementary_products.value;

const render = (product, blocks = allParts) =>
  section('product-details', { blocks, variables: { product, pages: { contact: { url: '/pages/contact' } } } })({});
const nav = (canvas) => within(canvas.getByRole('navigation', { name: 'On this page' }));

/**
 * `sections/product-details.liquid`: the product page's Overview, Specs, Care, Reviews and Questions, under links to
 * each. Each part shows only when the product has its data, so a product with less data gets a shorter page. On
 * phones the parts are rows that open in place; from 750px, where these stories run, they all show open.
 */
export default {
  title: 'Sections/Product/Product details',
  parameters: { layout: 'fullscreen' },
  loaders: [loadStylesheet('section-product-details.css'), loadStylesheet('section-faq.css'), loadModule('product-details.js')],
  render: () => render(jacket),
};

export const EveryPart = {
  play: async ({ canvas, userEvent }) => {
    const links = nav(canvas).getAllByRole('link');
    await expect(links.map((link) => link.textContent)).toEqual(['Overview', 'Specs', 'Care', 'Reviews (126)', 'Questions']);
    await expect(nav(canvas).getByRole('link', { name: 'Care' })).toHaveAttribute('href', '#product-care');

    await expect(canvas.getByRole('heading', { level: 2, name: "Novus Men's Jacket 350N" })).toBeVisible();
    await expect(canvas.getByRole('heading', { level: 3, name: 'Back zip' })).toBeVisible();

    // Specs: the safety rows, then the category fields, then the rest.
    const specs = within(canvas.getByRole('heading', { level: 2, name: 'Specifications' }).closest('details'));
    await expect(specs.getAllByRole('term').map((term) => term.textContent)).toEqual([
      'Protection',
      'FIE approved',
      'Material',
      'Hand',
      'Weight',
      'Closure',
      'Pairs with',
    ]);
    await expect(specs.getAllByRole('definition').map((value) => value.textContent.trim()).slice(0, 6)).toEqual([
      '350N',
      'No',
      'Polyester, Elastane',
      'Right, Left',
      '600 g to 650 g',
      'Back zip with collar strap',
    ]);
    await expect(specs.getByRole('link', { name: "Novus Men's Knickers 350N" })).toHaveAttribute('href', knickers.url);
    await expect(specs.getByRole('link', { name: 'Novus Underarm Protector 800N' })).toHaveAttribute('href', protector.url);

    await expect(canvas.getByText('Machine wash cold')).toBeVisible();
    await expect(canvas.getByText('No dry cleaning')).toBeVisible();
    await expect(canvas.getByText('Reviews from the reviews app')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Ask a question' })).toHaveAttribute('href', '/pages/contact');

    // The first five questions show; Show more questions reveals the rest and moves focus to the first of them.
    await expect(canvas.getByText('When will my order ship?')).toBeVisible();
    await expect(canvas.getByText('Does it come in kids sizes?')).not.toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Show more questions' }));
    await expect(canvas.getByText('Does it come in kids sizes?')).toBeVisible();
    await expect(canvas.getByText('Does it come in kids sizes?').closest('summary')).toHaveFocus();
    await expect(canvas.queryByRole('button', { name: 'Show more questions' })).toBeNull();
  },
};

// Every part stays open from 750px: its heading doesn't close it and isn't a tab stop.
export const OpenOnWideScreens = {
  play: async ({ canvas, userEvent }) => {
    const care = canvas.getByRole('heading', { level: 2, name: 'Care' }).closest('details');
    await expect(care).toHaveAttribute('open');
    await userEvent.click(within(care).getByRole('heading', { level: 2, name: 'Care' }));
    await expect(care).toHaveAttribute('open');
    await expect(care.querySelector('summary')).toHaveAttribute('tabindex', '-1');
  },
};

export const NoReviewsYet = {
  render: () => render({ ...jacket, metafields: { ...jacket.metafields, reviews: { rating_count: { value: 0 } } } }),
  play: async ({ canvas }) => {
    await expect(nav(canvas).queryByRole('link', { name: /Reviews/ })).toBeNull();
    await expect(canvas.queryByText('Reviews from the reviews app')).toBeNull();
  },
};

export const DescriptionOnly = {
  render: () => render({ title: 'Blade tape', description: '<p>Cloth tape for the last 6 inches of a blade.</p>', media: [], metafields: {} }),
  play: async ({ canvas }) => {
    await expect(nav(canvas).getAllByRole('link').map((link) => link.textContent)).toEqual(['Overview']);
    await expect(canvas.getByText('Cloth tape for the last 6 inches of a blade.')).toBeVisible();
    await expect(canvas.queryByRole('heading', { name: 'Specifications' })).toBeNull();
  },
};

export const NoDetails = {
  render: () => render({ title: 'Gift card', description: '', media: [], metafields: {} }),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('product-details')).toBeNull();
  },
};
