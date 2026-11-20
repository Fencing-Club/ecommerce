import { expect } from 'storybook/test';
import { block } from '../liquid.js';

/** `blocks/button.liquid`: a link styled as the theme's button, through `snippets/ui-button.liquid`. */
export default {
  title: 'Blocks/Button',
  render: block('button'),
  args: { label: 'Shop masks', link: '#masks', style: 'primary', size: 'md', show_arrow: false },
  argTypes: {
    style: { control: 'inline-radio', options: ['primary', 'secondary', 'outline'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
  },
};

export const Primary = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Shop masks' })).toHaveAttribute('href', '#masks');
  },
};

export const OutlineWithArrow = {
  args: { label: 'View all', link: '#all', style: 'outline', show_arrow: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '#all');
  },
};

export const Large = {
  args: { label: 'Shop clothing', link: '#clothing', style: 'secondary', size: 'lg' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Shop clothing' })).toHaveAttribute('href', '#clothing');
  },
};

export const WithoutLink = {
  args: { link: '' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Shop masks' })).toBeDisabled();
  },
};
