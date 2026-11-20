import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

const paginate = (current, pages) => ({
  pages,
  current_page: current,
  previous: current > 1 ? { url: `?page=${current - 1}` } : null,
  next: current < pages ? { url: `?page=${current + 1}` } : null,
  parts: [1, 2, 3, '…', pages].map((title) =>
    title === '…' || title === current ? { title, is_link: false } : { title, is_link: true, url: `?page=${title}` },
  ),
});

/** `snippets/ui-pagination.liquid`: numbered pages with previous and next, or a single next link. */
export default {
  title: 'Components/Pagination',
  render: snippet('ui-pagination', { stylesheets: ['section-main-collection.css'] }),
  args: { paginate: paginate(2, 8) },
};

export const Pages = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('navigation', { name: 'Pagination' })).toBeVisible();
    await expect(canvas.getByText('2')).toHaveAttribute('aria-current', 'page');
    await expect(canvas.getByRole('link', { name: 'Previous page' })).toHaveAttribute('href', '?page=1');
  },
};

export const FirstPage = {
  args: { paginate: paginate(1, 8) },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('link', { name: 'Previous page' })).toBeNull();
  },
};

export const NextOnly = {
  args: { mode: 'next', next_label: 'Load more' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Load more' })).toHaveAttribute('href', '?page=3');
  },
};
