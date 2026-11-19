import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

/** `snippets/ui-link.liquid`: a standalone text link, such as "View all" beside a heading. */
export default {
  title: 'Elements/Link',
  render: snippet('ui-link'),
  args: { label: 'View all', url: '#all' },
};

export const Default = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '#all');
  },
};

export const WithIcon = {
  args: { icon: 'arrow-right' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'View all' }).querySelector('svg')).toBeInTheDocument();
  },
};

export const IconBefore = {
  args: { label: 'Back to the Journal', icon: 'arrow-right', icon_position: 'before', reverse_icon: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Back to the Journal' })).toBeInTheDocument();
  },
};
