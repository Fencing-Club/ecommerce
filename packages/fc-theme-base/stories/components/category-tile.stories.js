import { expect } from 'storybook/test';
import { image } from '../fixtures.js';
import { snippet } from '../liquid.js';

/**
 * `snippets/ui-category-tile.liquid`: a category under a collection's title, with its photo and how many products it
 * holds. Phones show it as a smaller pill.
 */
export default {
  title: 'Components/Category tile',
  render: (args) => `<div style="max-width: 20rem">${snippet('ui-category-tile', { stylesheets: ['section-main-collection.css'] })(args)}</div>`,
  args: { url: '/collections/jackets', label: 'Jackets', count: 24, image: image('collection-aero-competition-jacket.jpg', 'Jacket') },
};

export const Default = {
  play: async ({ canvas }) => {
    const tile = canvas.getByRole('link', { name: /Jackets/ });
    await expect(tile).toHaveAttribute('href', '/collections/jackets');
    await expect(canvas.getByText('24 products')).toBeVisible();
    // The photo only illustrates the name, so it has no text of its own.
    await expect(tile.querySelector('img')).toHaveAttribute('alt', '');
  },
};

export const LongName = {
  args: { label: 'Pants and knickers', count: 18, image: image('collection-knicker-pants-350n.jpg', 'Knickers') },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Pants and knickers')).toBeVisible();
  },
};

export const NoPhoto = {
  args: { image: null, count: 1 },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('img')).toBeNull();
    await expect(canvas.getByText('1 product')).toBeVisible();
  },
};
