import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

/** `snippets/ui-pill.liquid`: a rounded label or link, such as the collection's subcategory links. */
export default {
  title: 'Elements/Pill',
  render: snippet('ui-pill'),
  args: { label: 'Jackets' },
};

export const Label = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Jackets')).not.toHaveAttribute('href');
  },
};

export const AsLink = {
  args: { url: '#jackets' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Jackets' })).not.toHaveAttribute('aria-current');
  },
};

export const Active = {
  args: { url: '#jackets', active: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Jackets' })).toHaveAttribute('aria-current', 'page');
  },
};

export const WithIcon = {
  args: { url: '#jackets', icon: 'arrow-right' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Jackets' })).toHaveClass('ui-pill--with-icon');
  },
};
