import { expect } from 'storybook/test';
import { products } from '../fixtures.js';
import { block } from '../liquid.js';

/** `blocks/image.liquid`: an image at its own shape or cropped to a fixed aspect ratio. */
export default {
  title: 'Blocks/Image',
  render: block('image'),
  args: { image: products[0].featured_image, aspect_ratio: 'adapt' },
  argTypes: {
    aspect_ratio: { control: 'inline-radio', options: ['adapt', 'square', 'portrait', 'landscape', 'wide'] },
  },
};

export const FitImage = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('img', { name: 'Competition jacket' })).toBeVisible();
  },
};

export const Portrait = {
  args: { aspect_ratio: 'portrait' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('img', { name: 'Competition jacket' })).toBeVisible();
  },
};

export const Wide = {
  args: { aspect_ratio: 'wide' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('img', { name: 'Competition jacket' })).toBeVisible();
  },
};

// Before the merchant picks an image, Shopify draws a placeholder illustration, which the story's stand-in leaves out.
export const NoImage = {
  args: { image: null },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('img')).toBeNull();
  },
};
