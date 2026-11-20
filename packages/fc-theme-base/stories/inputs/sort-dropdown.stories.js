import { expect, waitFor } from 'storybook/test';
import { snippet } from '../liquid.js';

const option = (name, value) => ({ name, value });
const collection = {
  sort_by: '',
  default_sort_by: 'manual',
  sort_options: [
    option('Featured', 'manual'),
    option('Best selling', 'best-selling'),
    option('Alphabetically, A-Z', 'title-ascending'),
    option('Price, low to high', 'price-ascending'),
    option('Price, high to low', 'price-descending'),
    option('Date, new to old', 'created-descending'),
  ],
};

/** `snippets/ui-sort-dropdown.liquid`: the sort control on collection and search pages, built on the Select. */
export default {
  title: 'Inputs/Sort dropdown',
  render: (args) => `<div style="max-width: 24rem">${snippet('ui-sort-dropdown')(args)}</div>`,
  args: { results: collection, sort_label: 'Sort:', default_label: 'Featured' },
};

export const Collection = {
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('.ui-select__trigger')).toHaveTextContent('Featured'));
  },
};

export const Search = {
  args: {
    results: { sort_by: '', default_sort_by: 'relevance', sort_options: [option('Relevance', 'relevance'), option('Price, low to high', 'price-ascending'), option('Price, high to low', 'price-descending')] },
    sort_label: 'Sort by',
    default_label: undefined,
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('.ui-select__trigger')).toHaveTextContent('Relevance'));
  },
};
