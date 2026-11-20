import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

/** `snippets/ui-product-card-skeleton.liquid`: placeholder cards while filtered search results load. */
export default {
  title: 'Components/Product card skeleton',
  render: (args) =>
    `<div class="collection loading">${snippet('ui-product-card-skeleton', { stylesheets: ['section-main-search.css'] })(args)}</div>`,
  args: { count: 4 },
};

export const Loading = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('.ui-card-skeleton')).toHaveLength(4);
    await expect(canvasElement.querySelector('.search-results__skeleton')).toHaveAttribute('aria-hidden', 'true');
  },
};
