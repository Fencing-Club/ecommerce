import { expect, waitFor, within } from 'storybook/test';
import { productPageProduct } from '../../fixtures.js';
import { loadModule, loadScript, loadStylesheet, section } from '../../liquid.js';

// A US shopper paying in dollars, so the ships line gives arrival dates.
const store = {
  shop: { currency: 'USD', permanent_domain: 'example.myshopify.com' },
  cart: { currency: { iso_code: 'USD', symbol: '$' } },
  localization: { country: { iso_code: 'US' } },
};

const trust = [
  { id: 'returns', type: 'trust', settings: { icon: 'rotate-ccw', title: 'Free returns', detail: '30 days in the US' } },
];

const renderSection = (variantId) =>
  section('main-product', { sectionBlocks: trust, variables: { product: productPageProduct(variantId) }, globals: store })({ restock_form: true });

// Back-in-stock signups the stories sent, with STOQ's answer: the email `fail@example.com` gets an error.
const signups = [];

/** Answers `product-options` as the store would, by rendering the section again for the `?variant=` asked for. */
const serveVariants = () => {
  if (window.productPageStoryFetch) return;
  window.productPageStoryFetch = true;
  const storeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    if (url.hostname === 'app.stoqapp.com') {
      const body = JSON.parse(init.body);
      signups.push({ headers: init.headers, body });
      const intents = body.customer.email === 'fail@example.com' ? [] : [{ id: signups.length }];
      return new Response(JSON.stringify({ intents, errors: intents.length ? [] : ['Signup failed'] }), { status: intents.length ? 201 : 200 });
    }
    if (url.searchParams.get('section_id') !== 'story' || !url.pathname.startsWith('/products/')) return storeFetch(input, init);
    return new Response(renderSection(Number(url.searchParams.get('variant'))), { headers: { 'Content-Type': 'text/html' } });
  };
};

const buyBar = (canvasElement) => canvasElement.querySelector('[data-product-sticky]');

/**
 * `sections/main-product.liquid`: the product page's photos beside the buy box. Size starts unpicked; picking one
 * loads that variant's price, stock and buttons, and brings its photo to the front. The ships line counts down to the
 * day's cutoff. Photos open the photo viewer, Size guide opens the size chart drawer, and the buy bar takes over once
 * Add to cart scrolls away. The tall space after the section is there to scroll into.
 */
export default {
  title: 'Sections/Product/Main product',
  parameters: { layout: 'fullscreen' },
  // The section's own stylesheet tag loads as it renders, so the play tests could start before its styles apply.
  loaders: [
    loadStylesheet('section-main-product.css'),
    loadScript('product-form.js'),
    loadScript('ui-drawer.js'),
    loadModule('photo-gallery.js'),
    loadModule('product-options.js'),
    loadModule('product-page.js'),
    loadModule('product-restock.js'),
    serveVariants,
  ],
  // The theme hides empty divs, so the space holds a non-breaking space.
  render: ({ variant }) => `${renderSection(variant)}<div style="height: 150vh" aria-hidden="true">&nbsp;</div>`,
  args: { variant: undefined },
};

export const PickASize = {
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Novus Underarm Protector 350N' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Shop all FWF' })).toBeVisible();
    await expect(canvas.getByRole('img', { name: 'Rated 4.7 out of 5' })).toBeVisible();

    // Adding before a size asks for one, and Buy it now waits for it too.
    await expect(canvas.getByRole('group', { name: 'Size Choose a size' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Buy it now' })).toBeNull();
    await userEvent.click(canvas.getAllByRole('button', { name: 'Add to cart' })[0]);
    await expect(canvas.getByText('Choose a size first')).toBeVisible();

    // Picking a size loads that variant, keeps the choice and brings its photo to the front.
    await userEvent.click(canvas.getByRole('radio', { name: 'M' }));
    await waitFor(() => expect(canvas.getByRole('group', { name: 'Size M' })).toBeVisible());
    await expect(canvas.getByRole('radio', { name: 'M' })).toBeChecked();
    await expect(canvas.getByText('In stock in Woodinville, WA')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Buy it now' })).toBeVisible();
    const photos = within(canvas.getByRole('list', { name: 'Photos' }));
    await expect(photos.getAllByRole('button')[0]).toHaveAccessibleName('Open photo 3 of 6');
  },
};

export const LowStock = {
  args: { variant: 9202 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Only 2 left in size S')).toBeVisible();
    await expect(canvas.getAllByRole('button', { name: 'Add to cart' })[0]).toBeEnabled();
  },
};

export const PartnerWarehouse = {
  args: { variant: 9206 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('In stock at our partner warehouse')).toBeVisible();
    // The ships row leads the trust notes. US shoppers see partner stock's arrival dates, which allow for its dispatch.
    const [ships, returns] = canvas.getAllByRole('listitem').filter((item) => item.closest('.product-page__trust'));
    await expect(ships).toHaveTextContent(/^Arrives \w{3} \d+ to \w{3} \d+$/);
    await expect(returns).toHaveTextContent(/^Free returns\s*30 days in the US$/);
  },
};

export const SoldOut = {
  args: { variant: 9208 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Sold out in size XL')).toBeVisible();
    await expect(canvas.getAllByRole('button', { name: 'Sold out' })[0]).toHaveAttribute('aria-disabled', 'true');
    await expect(canvas.queryByRole('button', { name: 'Buy it now' })).toBeNull();
    await expect(canvas.getByText('Notify me when it’s back')).toBeVisible();
    await expect(canvas.getByText('We’ll email you as soon as size XL is restocked.')).toBeVisible();
  },
};

export const BackInStockSignup = {
  args: { variant: 9208 },
  play: async ({ canvas, userEvent }) => {
    const email = canvas.getByRole('textbox', { name: 'Email' });
    const notify = canvas.getByRole('button', { name: 'Notify me' });

    await userEvent.click(notify);
    await expect(canvas.getByRole('status')).toHaveTextContent('Enter a valid email.');
    await expect(email).toHaveAttribute('aria-invalid', 'true');

    await userEvent.type(email, 'fail@example.com');
    await userEvent.click(notify);
    await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent('We couldn’t sign you up. Try again.'));

    await userEvent.clear(email);
    await userEvent.type(email, 'fencer@example.com');
    await userEvent.click(notify);
    await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent('Thanks. We’ll email you when it’s back.'));
    await expect(canvas.queryByRole('textbox', { name: 'Email' })).toBeNull();
    const { headers, body } = signups.at(-1);
    await expect(headers['X-Shopify-Shop-Domain']).toBe('example.myshopify.com');
    await expect(body.intent).toMatchObject({ shopify_variant_id: 9208, channel: 'email', quantity: 1, source: 'api' });
    await expect(body.customer.email).toBe('fencer@example.com');
  },
};

export const Photos = {
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('button', { name: 'View all 6 photos' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Open photo 2 of 6' }));
    const viewer = within(canvas.getByRole('dialog', { name: 'Photos of Novus Underarm Protector 350N' }));
    await waitFor(() => expect(viewer.getByText('2 of 6')).toBeVisible());
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(viewer.getByText('3 of 6')).toBeVisible());
    await userEvent.click(viewer.getByRole('button', { name: 'Close photos' }));
    await expect(canvas.getByRole('button', { name: 'Open photo 2 of 6' })).toHaveFocus();
  },
};

export const SizeGuide = {
  play: async ({ canvas, userEvent }) => {
    const guide = canvas.getByRole('link', { name: 'Size guide' });
    await expect(guide).toHaveAttribute('href', '/pages/size-charts/underarm-protectors');
    await userEvent.click(guide);
    const drawer = canvas.getByRole('dialog', { name: 'Size chart: Underarm protectors' });
    await waitFor(() => expect(drawer).toBeVisible());
    await userEvent.click(within(drawer).getByRole('button', { name: 'Close size chart' }));
    await waitFor(() => expect(guide).toHaveFocus());
  },
};

export const BuyBar = {
  args: { variant: 9204 },
  play: async ({ canvasElement }) => {
    const bar = buyBar(canvasElement);
    window.scrollTo(0, 0);
    await waitFor(() => expect(bar).not.toBeVisible());
    window.scrollTo(0, document.documentElement.scrollHeight);
    await waitFor(() => expect(bar).toBeVisible());
    await expect(within(bar).getByText('Right-handed, size M')).toBeVisible();
    await expect(within(bar).getByRole('button', { name: 'Add to cart' })).toBeVisible();
    window.scrollTo(0, 0);
  },
};

export const BuyBarBeforeASize = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const bar = buyBar(canvasElement);
    window.scrollTo(0, document.documentElement.scrollHeight);
    await waitFor(() => expect(bar).toBeVisible());
    await userEvent.click(within(bar).getByRole('button', { name: 'Choose a size' }));
    await waitFor(() => expect(canvas.getByRole('radio', { name: 'XS' })).toHaveFocus());
    window.scrollTo(0, 0);
  },
};
