import { expect, fireEvent, waitFor, within } from 'storybook/test';
import { collectionFilters as f, collectionMenu, collectionPage } from '../fixtures.js';
import { loadModule, loadScript, snippet } from '../liquid.js';

const render = snippet('collection-facet-filters', {
  stylesheets: ['component-facets.css', 'section-main-collection.css'],
  globals: { linklists: collectionMenu.linklists, collections: collectionMenu.collections, routes: collectionMenu.routes },
});

const allFilters = (on = {}) => [
  f.weapon(on.weapon),
  f.protection(on.protection),
  f.fie(on.fie),
  f.hand(on.hand),
  f.size(on.size),
  f.color(on.color),
  f.brand(on.brand),
  f.price(on.price),
  f.availability(on.inStock),
];

/**
 * The collection page's filter panel, `snippets/collection-facet-filters.liquid`: the category tree, then each filter
 * Shopify supplies. Protection rating and FIE status share one Protection level group, size and hand are pills,
 * colors are swatches, long lists show four with Show more, and availability is an In stock only switch. The price
 * slider and fields stay in step through `price-range` in `assets/facets.js`. Each group is a `ui-accordion`, so it
 * opens and closes with the shared motion.
 */
export default {
  title: 'Components/Filter panel',
  loaders: [loadScript('motion.js'), loadModule('collection-page.js')],
  render: ({ filters }) =>
    `<aside class="collection-filter-panel" aria-label="Filters" style="max-width: 24rem">${render({
      results: { ...collectionPage(), filters },
      section_id: 'story',
      show_categories: true,
    })}</aside>`,
  args: { filters: allFilters() },
};

export const Default = {
  play: async ({ canvas }) => {
    for (const name of ['Category', 'Weapon', 'Protection level', 'Hand', 'Size', 'Color', 'Brand', 'Price', 'Availability']) {
      await expect(canvas.getByRole('heading', { level: 3, name })).toBeVisible();
    }
    // FIE status has no group of its own.
    await expect(canvas.queryByRole('heading', { name: 'FIE Rating' })).toBeNull();
    await expect(canvas.getByRole('checkbox', { name: 'Foil' })).toHaveAttribute('data-filter-url', '#add-weapon-foil');
    await expect(canvas.getByRole('checkbox', { name: /Protection level FIE/ })).toBeVisible();
    await expect(canvas.queryByRole('checkbox', { name: /1600N/ })).toBeNull();
    await expect(canvas.getByRole('checkbox', { name: 'Left-handed' })).toBeVisible();
    await expect(canvas.getByRole('checkbox', { name: '3XL' })).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: 'From ($)' })).toHaveValue('');
    await expect(canvas.getByRole('switch', { name: 'In stock only' })).not.toBeChecked();
  },
};

export const CloseAGroup = {
  play: async ({ canvas, userEvent }) => {
    const weapon = canvas.getByRole('heading', { name: 'Weapon' });
    await userEvent.click(weapon);
    await waitFor(() => expect(canvas.getByRole('checkbox', { name: 'Foil' })).not.toBeVisible());
    await userEvent.click(weapon);
    await waitFor(() => expect(canvas.getByRole('checkbox', { name: 'Foil' })).toBeVisible());
    // The options fade in. Let them finish so the accessibility check reads their final colors.
    await Promise.all(weapon.closest('details').getAnimations({ subtree: true }).map((animation) => animation.finished));
  },
};

export const ShowMoreBrands = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const brands = within(canvas.getByRole('heading', { name: 'Brand' }).closest('details'));
    await expect(brands.getByRole('checkbox', { name: 'NEPS' })).toBeVisible();
    await expect(brands.queryByRole('checkbox', { name: 'Allstar' })).toBeNull();
    await userEvent.click(brands.getByRole('button', { name: 'Show 4 more' }));
    await expect(brands.getByRole('checkbox', { name: 'Allstar' })).toBeVisible();
    await expect(brands.getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true');
    await expect(canvasElement.querySelectorAll('[data-filter-extra]:not([hidden])')).toHaveLength(4);
  },
};

export const InUse = {
  args: { filters: allFilters({ protection: ['800N'], fie: ['FIE'], hand: ['Left-handed'], size: ['3XL'], color: ['Navy'], inStock: true }) },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('checkbox', { name: /Protection level 800N/ })).toBeChecked();
    await expect(canvas.getByRole('checkbox', { name: /Protection level FIE/ })).toBeChecked();
    await expect(canvas.getByRole('checkbox', { name: 'Left-handed' })).toBeChecked();
    await expect(canvas.getByRole('checkbox', { name: '3XL' })).toHaveAttribute('data-filter-url', '#remove-size-3xl');
    await expect(canvas.getByRole('switch', { name: 'In stock only' })).toBeChecked();
  },
};

export const PriceSlider = {
  loaders: [loadModule('facets.js')],
  args: { filters: [f.price(20000)] },
  play: async ({ canvas, userEvent }) => {
    const lowest = canvas.getByRole('slider', { name: 'Lowest price' });
    const highest = canvas.getByRole('slider', { name: 'Highest price' });
    await expect(lowest).toHaveValue('0');
    await expect(highest).toHaveValue('200');
    await expect(highest).toHaveAttribute('aria-valuetext', '$200');
    // Dragging a handle fills its field.
    lowest.value = '50';
    await fireEvent.input(lowest);
    await expect(canvas.getByRole('textbox', { name: 'From ($)' })).toHaveValue('50');
    // Typing a price moves its handle.
    const to = canvas.getByRole('textbox', { name: 'To ($)' });
    await userEvent.clear(to);
    await userEvent.type(to, '120');
    await expect(highest).toHaveValue('120');
  },
};
