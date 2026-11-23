import { expect } from 'storybook/test';
import { articles, sectionHeader } from '../../fixtures.js';
import { section } from '../../liquid.js';

/**
 * `sections/journal-highlights.liquid`: three posts under a heading, the latest from the chosen blog or, on a product
 * page, the articles the product links in `custom.articles`.
 */
export default {
  title: 'Sections/Home/Journal highlights',
  parameters: { layout: 'fullscreen' },
  args: { blog: 'journal', read_label: 'Read more' },
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

const productJournal = (linked) =>
  section('journal-highlights', {
    staticBlocks: [sectionHeader(null, 'From the Journal', { label: 'View all', link: '#journal' })],
    variables: { product: { metafields: { custom: { articles: { value: linked } } } } },
  });

export const ProductArticles = {
  args: { source: 'product', read_label: 'Read more' },
  render: productJournal([...articles].reverse()),
  play: async ({ canvas }) => {
    const titles = canvas.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent.trim());
    await expect(titles).toEqual([...articles].reverse().slice(0, 3).map((article) => article.title));
    await expect(canvas.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '#journal');
    await expect(canvas.getAllByRole('link', { name: /Read more/ })).toHaveLength(titles.length);
  },
};

export const ProductWithoutArticles = {
  args: { source: 'product', read_label: 'Read more' },
  render: productJournal(null),
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('heading')).toBeNull();
  },
};
