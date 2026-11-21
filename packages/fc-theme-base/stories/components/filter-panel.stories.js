import { expect } from 'storybook/test';
import { renderLiquid, snippet } from '../liquid.js';

// Shopify's collection filters, shaped like collection.filters.
const value = (param, label, count, active = false) => ({
  param_name: param,
  label,
  value: label.toLowerCase(),
  count,
  active,
  url_to_add: `#add-${label.toLowerCase()}`,
  url_to_remove: `#remove-${label.toLowerCase()}`,
});
const availability = (inStockActive = false) => ({
  label: 'Availability',
  type: 'list',
  param_name: 'filter.v.availability',
  values: [value('filter.v.availability', 'In stock', 24, inStockActive), value('filter.v.availability', 'Out of stock', 3)],
});
const price = (max = null) => ({
  label: 'Price',
  type: 'price_range',
  range_max: 50000,
  min_value: { param_name: 'filter.v.price.gte', value: null },
  max_value: { param_name: 'filter.v.price.lte', value: max },
});
const size = {
  label: 'Size',
  type: 'list',
  param_name: 'filter.v.option.size',
  values: ['S', 'M', 'L', 'XL'].map((label, index) => value('filter.v.option.size', label, index === 3 ? 0 : 5)),
};

/**
 * The collection page's filter panel: `snippets/collection-filter-header.liquid` over
 * `snippets/collection-facet-filters.liquid`, with checkboxes, the price range from `snippets/price-facet.liquid` and
 * size choices.
 */
export default {
  title: 'Components/Filter panel',
  render: ({ filters }) =>
    `<aside class="collection-filter-panel" aria-labelledby="StoryFilters" style="max-width: 28rem">${snippet('collection-filter-header', {
      stylesheets: ['component-facets.css', 'section-main-collection.css'],
    })({ heading_id: 'StoryFilters', heading: 'Filters', clear_label: 'Clear all', clear_url: '#collection' })}${renderLiquid(
      'collection-facet-filters',
      { results: { filters }, section_id: 'story' },
    )}</aside>`,
  args: { filters: [availability(), price(), size] },
};

export const Default = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: 'Filters' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Clear all' })).toHaveAttribute('href', '#collection');
    await expect(canvas.getByRole('checkbox', { name: /In stock/ })).not.toBeChecked();
    await expect(canvas.getByRole('textbox', { name: 'From ($)' })).toHaveValue('');
    await expect(canvas.getByRole('checkbox', { name: 'M' })).toBeVisible();
    await expect(canvas.queryByRole('checkbox', { name: 'XL' })).toBeNull();
  },
};

export const Selected = {
  args: { filters: [availability(true), price(20000), size] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('checkbox', { name: /In stock/ })).toBeChecked();
    await expect(canvas.getByRole('textbox', { name: 'To ($)' })).toHaveValue('200.00');
  },
};

export const CollapsedGroup = {
  play: async ({ canvas, userEvent }) => {
    const availabilityToggle = canvas.getByRole('heading', { name: 'AVAILABILITY' });
    await userEvent.click(availabilityToggle);
    await expect(canvas.getByRole('checkbox', { name: /In stock/, hidden: true })).not.toBeVisible();
  },
};
