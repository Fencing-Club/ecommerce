import { expect } from 'storybook/test';
import { articles } from '../fixtures.js';
import { snippet } from '../liquid.js';

/** `snippets/ui-article-card.liquid`: a Journal post on the blog, the homepage and search. */
export default {
  title: 'Components/Article card',
  render: (args) => `<div style="max-width: 40rem">${snippet('ui-article-card')(args)}</div>`,
  args: { article: articles[0], read_label: 'Read more', heading_level: 3 },
};

export const Default = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 3, name: 'Choosing your first fencing kit' })).toBeVisible();
    await expect(canvas.getByText('August 10, 2026')).toBeVisible();
    await expect(canvas.getByRole('link', { name: /Read more/ })).toHaveAttribute('href', '#article-kit');
  },
};

export const NoImage = {
  args: { article: articles[1] },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
  },
};
