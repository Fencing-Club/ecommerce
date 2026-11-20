import { expect } from 'storybook/test';
import { block } from '../liquid.js';

/** `blocks/link.liquid`: a text link with an optional arrow, such as "View all" beside a section heading. */
export default {
  title: 'Blocks/Link',
  render: block('link'),
  args: { label: 'View all', link: '#all', show_arrow: true },
};

export const WithArrow = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '#all');
  },
};

export const WithoutArrow = {
  args: { label: 'Shipping policy', link: '#shipping', show_arrow: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Shipping policy' })).toHaveAttribute('href', '#shipping');
  },
};
