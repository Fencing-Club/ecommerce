import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

const page = (title, content) => ({ title, url: `#${title.toLowerCase().replaceAll(' ', '-')}`, content });

/** `snippets/ui-page-result-row.liquid`: a page in search results. The excerpt is the page's first 20 words. */
export default {
  title: 'Components/Page result row',
  render: (args) =>
    `<ul style="max-width: 64rem; margin: 0; padding: 0; list-style: none">${snippet('ui-page-result-row', { stylesheets: ['section-main-search.css'] })(args)}</ul>`,
  args: {
    page: page(
      'Shipping and delivery',
      '<p>We ship most orders within one business day from Boston. US orders over $375 ship free, and every order gets tracking by email.</p>',
    ),
  },
};

export const Default = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: 'Shipping and delivery', level: 3 })).toBeVisible();
    await expect(canvas.getByText(/^We ship most orders/)).toHaveTextContent(/\.\.\.$/);
  },
};

export const WithoutExcerpt = {
  args: { page: page('Size charts', '') },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.ui-page-result-row__excerpt')).toBeNull();
  },
};
