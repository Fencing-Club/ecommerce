import { expect } from 'storybook/test';
import { block } from '../liquid.js';

/** `blocks/heading.liquid`: a heading at the level and size the merchant picks. */
export default {
  title: 'Blocks/Heading',
  render: block('heading'),
  args: { heading: 'Best sellers', tag: 'h2', size: 'lg', alignment: 'left' },
  argTypes: {
    tag: { control: 'inline-radio', options: ['h1', 'h2', 'h3', 'h4'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg', 'xl'] },
    alignment: { control: 'inline-radio', options: ['left', 'center', 'right'] },
  },
};

export const SectionHeading = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: 'Best sellers', level: 2 })).toBeVisible();
  },
};

export const PageTitle = {
  args: { heading: 'Fencing equipment for every level', tag: 'h1', size: 'xl', alignment: 'center' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: 'Fencing equipment for every level', level: 1 })).toBeVisible();
  },
};

export const Small = {
  args: { heading: 'Shipping and returns', tag: 'h3', size: 'sm' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: 'Shipping and returns', level: 3 })).toBeVisible();
  },
};
