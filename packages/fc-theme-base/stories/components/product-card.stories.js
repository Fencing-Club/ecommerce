import { expect } from 'storybook/test';
import { products } from '../fixtures.js';
import { snippet } from '../liquid.js';

/**
 * `snippets/ui-product-card.liquid`: the product card on the homepage, collections and search. The product page's
 * related products still use Dawn's `card-product` until they move onto this card.
 */
export default {
  title: 'Components/Product card',
  render: (args) => `<div style="max-width: 30rem">${snippet('ui-product-card')(args)}</div>`,
  args: { product: products[0], card_id: 'card-801', show_type: true, show_price: true },
};

export const Default = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: 'Competition jacket' })).toBeVisible();
    await expect(canvas.getByText('JACKETS')).toBeVisible();
    await expect(canvas.getByText('$69.95')).toBeVisible();
    for (const link of canvas.getAllByRole('link', { name: 'Competition jacket' })) {
      await expect(link).toHaveAttribute('href', '#product-801');
    }
  },
};

export const WithBadge = {
  args: { badge_label: 'SALE' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('SALE')).toBeVisible();
    // The image link's name includes the badge it shows.
    await expect(canvas.getByRole('link', { name: 'Competition jacket, SALE' })).toHaveAttribute('href', '#product-801');
  },
};

export const TrimmedPrice = {
  args: { product: products[2], card_id: 'card-803', trim_price: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('$18')).toBeVisible();
  },
};

export const Search = {
  args: { variant: 'search' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('article')).toHaveClass('ui-product-card--search');
  },
};

export const NoImage = {
  args: { product: { ...products[1], featured_image: null }, card_id: 'card-802' },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Fencing glove' })).toBeVisible();
  },
};
