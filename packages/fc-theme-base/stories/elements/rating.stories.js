import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

/**
 * `snippets/ui-rating.liquid`: a product's star rating, five stars filled to the rating, then the rating and the
 * review count. Quick view uses the small size; the product page uses the medium one and links the count to the
 * reviews.
 */
export default {
  title: 'Elements/Rating',
  render: snippet('ui-rating'),
  args: { rating: 4.7, count: 88 },
};

export const Small = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('img', { name: 'Rated 4.7 out of 5' })).toBeVisible();
    await expect(canvas.getByText('88 reviews')).toBeVisible();
  },
};

export const LinkedCount = {
  args: { size: 'md', url: '#reviews' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: '88 reviews' })).toHaveAttribute('href', '#reviews');
  },
};

export const OneReview = {
  args: { rating: 5, count: 1 },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('img', { name: 'Rated 5.0 out of 5' })).toBeVisible();
    await expect(canvas.getByText('1 review')).toBeVisible();
  },
};
