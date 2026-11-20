import { expect } from 'storybook/test';
import { articles, sectionHeader } from '../../fixtures.js';
import { section } from '../../liquid.js';

/** `sections/journal-highlights.liquid`: the latest posts from the chosen blog. */
export default {
  title: 'Sections/Home/Journal highlights',
  parameters: { layout: 'fullscreen' },
  args: { blog: 'journal' },
  render: section('journal-highlights', {
    staticBlocks: [sectionHeader('The journal', 'From the journal', { label: 'View all posts', link: '#journal' })],
    variables: { blogs: { journal: { url: '#journal', articles_count: articles.length, articles } } },
  }),
};

export const Posts = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'From the journal' })).toBeVisible();
    await expect(canvas.getByRole('heading', { level: 3, name: 'Choosing your first fencing kit' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'View all posts' })).toHaveAttribute('href', '#journal');
  },
};

export const NoPosts = {
  args: { blog: 'missing' },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('heading')).toBeNull();
  },
};
