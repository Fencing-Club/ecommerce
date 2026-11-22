import { expect, waitFor, within } from 'storybook/test';
import { quickViewProduct } from '../../fixtures.js';
import { loadModule, loadScript, renderLiquid } from '../../liquid.js';

// A US shopper paying in dollars, who gets free shipping.
const store = { shop: { currency: 'USD' }, cart: { currency: { iso_code: 'USD', symbol: '$' } } };

/**
 * Answers quick view's requests as the store would, by rendering `sections/product-quick-view.liquid` for the product
 * and the `?variant=` asked for. A product URL with `missing` in it fails, and one with `loading` in it never answers.
 */
const serveQuickView = () => {
  if (window.quickViewStoryFetch) return;
  window.quickViewStoryFetch = true;
  const storeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    if (url.searchParams.get('section_id') !== 'product-quick-view') return storeFetch(input, init);
    if (url.pathname.includes('missing')) return new Response('', { status: 500 });
    if (url.pathname.includes('loading')) return new Promise(() => {});
    const product = quickViewProduct(Number(url.searchParams.get('variant')) || undefined);
    try {
      return new Response(renderLiquid('product-quick-view', { product }, store), { headers: { 'Content-Type': 'text/html' } });
    } catch (error) {
      // Quick view shows its own error, so the cause goes to the console.
      console.error(error);
      throw error;
    }
  };
};

const dialog = (canvasElement) => within(canvasElement.querySelector('[data-quick-view-dialog]'));

/**
 * `sections/product-quick-view.liquid` in `snippets/quick-view-dialog.liquid`: the product a card's Quick view button
 * opens, fetched into the page's dialog. Desktop shows the photos beside the buy box; phones get a sheet from the
 * bottom. Size starts unpicked, Size guide goes to the size chart page, and a request that fails offers Try again and
 * the product page.
 */
export default {
  title: 'Sections/Collection/Quick view',
  parameters: { layout: 'fullscreen' },
  loaders: [loadScript('product-form.js'), loadModule('photo-gallery.js'), loadModule('product-options.js'), loadModule('quick-view.js'), serveQuickView],
  render: ({ url }) => {
    const product = { ...quickViewProduct(), url };
    const card = renderLiquid('ui-product-card', { product, card_id: 'card-9001', show_price: true, show_add: true, quick_view: true });
    return `<div style="max-width: 23rem; padding: 2.4rem">${card}</div>${renderLiquid('quick-view-dialog', {}, store)}`;
  },
  args: { url: '/products/novus-underarm-protector' },
};

export const PickASize = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Quick view' }));
    const view = dialog(canvasElement);
    await waitFor(() => expect(view.getByRole('heading', { level: 2, name: 'Novus Underarm Protector 350N' })).toBeVisible());
    await expect(canvas.getByRole('dialog', { name: 'Novus Underarm Protector 350N' })).toBeVisible();
    await expect(view.getByRole('img', { name: 'Rated 4.7 out of 5' })).toBeVisible();
    await expect(view.getByText('Free US shipping over $375')).toBeVisible();

    // Adding before a size asks for one.
    await expect(view.getByRole('group', { name: 'Size Choose a size' })).toBeVisible();
    await userEvent.click(view.getByRole('button', { name: 'Add to cart' }));
    await expect(view.getByText('Choose a size first')).toBeVisible();

    // Picking a size loads that variant and keeps the choice.
    await userEvent.click(view.getByRole('radio', { name: 'M' }));
    await waitFor(() => expect(view.getByRole('group', { name: 'Size M' })).toBeVisible());
    await expect(view.getByRole('radio', { name: 'M' })).toBeChecked();
    await expect(view.getByText('In stock in Woodinville, WA')).toBeVisible();
  },
};

export const Photos = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Quick view' }));
    const view = dialog(canvasElement);
    await waitFor(() => expect(view.getByText('1 of 3')).toBeVisible());
    await userEvent.click(view.getByRole('button', { name: 'Show photo 3' }));
    await waitFor(() => expect(view.getByText('3 of 3')).toBeVisible());
    await expect(view.getByRole('button', { name: 'Show photo 3' })).toHaveAttribute('aria-current', 'true');
  },
};

/** Size guide goes to the product's size chart page. */
export const SizeGuide = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Quick view' }));
    const view = dialog(canvasElement);
    await expect(await view.findByRole('link', { name: 'Size guide' })).toHaveAttribute('href', '/pages/size-charts/underarm-protectors');
  },
};

export const Close = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const opener = canvas.getByRole('button', { name: 'Quick view' });
    await userEvent.click(opener);
    const view = dialog(canvasElement);
    await view.findByRole('heading', { level: 2, name: 'Novus Underarm Protector 350N' });
    await userEvent.click(view.getByRole('button', { name: 'Close' }));
    await expect(canvasElement.querySelector('[data-quick-view-dialog]')).not.toHaveAttribute('open');
    await expect(opener).toHaveFocus();
  },
};

/** While the product loads, skeletons hold its place in quick view's own layout. */
export const Loading = {
  args: { url: '/products/loading' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Quick view' }));
    const view = dialog(canvasElement);
    await expect(view.getByRole('status')).toHaveTextContent('Loading product');
    await expect(canvas.getByRole('dialog', { name: 'Quick view' })).toBeVisible();
  },
};

export const Failed = {
  args: { url: '/products/missing' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Quick view' }));
    const view = dialog(canvasElement);
    const title = "We couldn't load this product";
    await expect(await view.findByRole('heading', { level: 2, name: title })).toBeVisible();
    await expect(canvas.getByRole('dialog', { name: title })).toBeVisible();
    await expect(view.getByRole('link', { name: 'View full details' })).toHaveAttribute('href', '/products/missing');
    // Trying again fails again here, and focus comes back to Try again.
    await userEvent.click(view.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(view.getByRole('button', { name: 'Try again' })).toHaveFocus());
  },
};
