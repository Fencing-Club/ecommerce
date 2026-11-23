import { expect, within } from 'storybook/test';
import { image, question } from '../../fixtures.js';
import { loadModule, loadStylesheet, section } from '../../liquid.js';

const photo = (file, alt) => ({ ...image(file, alt), media_type: 'image' });
const feature = (file, heading, text) => ({ image: { value: image(file, '') }, heading: { value: heading }, text: { value: text } });
const values = (...labels) => ({ value: labels.map((label) => ({ label })) });

const description =
  "<p>The Novus jacket moves with you. Four-way stretch fabric lets you lunge, recover and parry without the jacket pulling at your shoulders, and the back zip keeps the front smooth where touches land.</p><p>It's light enough to wear through a full evening of club bouts, and it washes at home.</p>";

const questions = [
  question('Can I wear this jacket at USA Fencing tournaments?', 'Yes, at most domestic events. Wear it with an 800N underarm protector and check your event’s rules.'),
  question('How do I choose between right and left hand?', 'Pick the hand you hold your weapon in. The zip sits on the other side.'),
  question('How should I wash it?', 'Close the back zip and machine wash it cold with a color-safe detergent.'),
  question('Can I return it if the size is wrong?', 'Yes. Unworn gear comes back free within 30 days in the US.'),
  question('When will my order ship?', 'Orders placed by 2pm Pacific time on a business day ship that day.'),
  question('Does it come in kids sizes?', 'Yes. The kids Novus jacket is a separate listing.'),
  question('Is it machine washable at 40°C?', 'Wash it cold to keep the stretch fabric in shape.'),
];

const knickers = { title: "Novus Men's Knickers 350N", url: '/products/novus-mens-knickers-350n' };
const protector = { title: 'Novus Underarm Protector 800N', url: '/products/novus-underarm-protector-800n' };

const jacket = {
  title: "Novus Men's Jacket 350N",
  description,
  // Shipping weights in grams, which differ by size.
  variants: [{ weight: 600 }, { weight: 625 }, { weight: 650 }, { weight: 0 }],
  media: [photo('collection-fie-800n-jacket.jpg', 'Novus jacket, front'), photo('collection-aero-competition-jacket.jpg', 'A fencer wearing the Novus jacket')],
  metafields: {
    custom: {
      protection_rating: { value: '350N' },
      fie_status: { value: 'Non-FIE' },
      closure: { value: 'Back zip with collar strap' },
      features: {
        value: [
          feature('collection-stretch-fencing-pants.jpg', 'Four-way stretch', 'Moves with every lunge and recovery, so the jacket never pulls.'),
          feature('collection-fie-800n-jacket.jpg', 'Back zip', 'A smooth front with nothing to catch a blade.'),
          feature('collection-mens-chest-protector.jpg', 'Soft lined collar', 'Comfortable against your neck under a mask bib.'),
          feature('collection-underarm-plastron-800n.jpg', '350N protection', 'Meets EN 13567 Level 1 for club training and domestic events.'),
        ],
      },
      care_symbols: { value: ['wash-cold', 'line-dry', 'no-bleach', 'no-tumble-dry', 'no-iron', 'no-dry-clean'] },
      care_note: { value: 'Use a color-safe detergent with no bleach. Close the back zip before washing.' },
      questions: { value: questions },
    },
    shopify: { 'gear-material': values('Polyester', 'Elastane'), handedness: values('Right', 'Left') },
    'shopify--discovery--product_recommendation': { complementary_products: { value: [knickers, protector] } },
    reviews: { rating_count: { value: 126 } },
  },
};

// A reviews app's block stands in for the app the store installs.
const reviewsApp = { id: 'reviews-app', type: 'text', settings: { text: '<p>Reviews from the reviews app</p>' } };
const allParts = [
  { id: 'overview', type: '_product-overview', settings: {} },
  { id: 'specs', type: '_product-specs', settings: {} },
  { id: 'care', type: '_product-care', settings: {} },
  { id: 'reviews', type: '_product-reviews', settings: {}, blocks: [reviewsApp] },
  { id: 'questions', type: '_product-questions', settings: {} },
];

const render = (product, blocks = allParts) =>
  section('product-details', { blocks, variables: { product, pages: { contact: { url: '/pages/contact' } } } })({});
const nav = (canvas) => within(canvas.getByRole('navigation', { name: 'On this page' }));

/**
 * `sections/product-details.liquid`: the product page's Overview, Specs, Care, Reviews and Questions, under links to
 * each. Each part shows only when the product has its data, so a product with less data gets a shorter page. On
 * phones the parts are rows that open in place; from 990px, where these stories run, they all show open.
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

// Every part stays open from 990px: its heading doesn't close it and isn't a tab stop.
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
