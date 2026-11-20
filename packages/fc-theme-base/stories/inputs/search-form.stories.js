import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

/** `snippets/ui-search-form.liquid`: the search field on the search page and in the header panel. */
export default {
  title: 'Inputs/Search form',
  render: (args) => `<div style="max-width: 56rem">${snippet('ui-search-form')(args)}</div>`,
  args: { input_id: 'SearchInput', label: 'Search products, guides and help', button_label: 'Search' },
};

export const Empty = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('search')).toBeVisible();
    await expect(canvas.getByLabelText('Search products, guides and help')).toHaveValue('');
  },
};

export const WithQuery = {
  args: { value: 'epee blade' },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Search products, guides and help')).toHaveValue('epee blade');
    await expect(canvas.getByRole('button', { name: 'Clear search term' })).toBeVisible();
  },
};
