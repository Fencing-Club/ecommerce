import { expect } from 'storybook/test';
import { cardProducts } from '../fixtures.js';
import { snippet } from '../liquid.js';

/**
 * `snippets/ui-protection-badge.liquid`: a product's protection level, the same dark pill for every level so it reads
 * on white and dark photos. Product cards and the product page show it over the photo.
 */
export default {
  title: 'Elements/Protection badge',
  render: (args) => `<div style="display: inline-flex; padding: 1.6rem; background: #fff">${snippet('ui-protection-badge')(args)}</div>`,
};

export const RatingAndFie = {
  args: { product: cardProducts.sale },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('800N FIE')).toBeVisible();
    await expect(canvas.getByText('Protection level')).toBeInTheDocument();
  },
};

export const RatingOnly = {
  args: { product: cardProducts.ownBrand },
  play: async ({ canvas }) => {
    // Non-FIE adds nothing to the rating.
    await expect(canvas.getByText('350N')).toBeVisible();
  },
};

export const FieOnly = {
  args: { product: { metafields: { custom: { protection_rating: { value: '' }, fie_status: { value: 'FIE' } } } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('FIE')).toBeVisible();
  },
};

export const Label = {
  args: { label: '1600N FIE' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('1600N FIE')).toBeVisible();
  },
};

export const NoLevel = {
  args: { product: cardProducts.single },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.ui-protection-badge')).toBeNull();
  },
};
