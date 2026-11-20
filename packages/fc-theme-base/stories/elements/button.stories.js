import { expect, fn } from 'storybook/test';
import iconNames from '../../scripts/icons.json';
import { snippet } from '../liquid.js';

// What a shopper does with any enabled button, whatever it looks like: find it by its name and press it.
const pressable =
  (name) =>
  async ({ canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name });
    const pressed = fn();
    button.addEventListener('click', pressed);
    await userEvent.click(button);
    await expect(pressed).toHaveBeenCalledOnce();
  };

/** `snippets/ui-button.liquid`: the theme's one button. */
export default {
  title: 'Elements/Button',
  render: snippet('ui-button'),
  args: { label: 'Add to cart', variant: 'primary' },
  argTypes: {
    variant: { control: 'inline-radio', options: ['primary', 'secondary', 'outline', 'ghost', 'icon'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    icon: { control: 'select', options: [undefined, ...iconNames] },
    trailing_icon: { control: 'select', options: [undefined, ...iconNames] },
  },
};

export const Primary = {
  args: { icon: 'plus' },
  play: pressable('Add to cart'),
};

export const Secondary = {
  args: { label: 'Continue shopping', variant: 'secondary' },
  play: pressable('Continue shopping'),
};

export const Outline = {
  args: { label: 'Continue shopping', variant: 'outline' },
  play: pressable('Continue shopping'),
};

export const Ghost = {
  args: { label: 'Clear filters', variant: 'ghost' },
  play: pressable('Clear filters'),
};

export const IconOnly = {
  args: { label: undefined, aria_label: 'Close', variant: 'icon', icon: 'x' },
  play: pressable('Close'),
};

export const TrailingIcon = {
  args: { label: 'Shop masks', trailing_icon: 'arrow-right' },
  play: pressable('Shop masks'),
};

export const Medium = {
  args: { size: 'md' },
  play: pressable('Add to cart'),
};

export const Large = {
  args: { label: 'Check out', size: 'lg' },
  play: pressable('Check out'),
};

export const AsLink = {
  args: { label: 'Shop clothing', url: '#clothing', variant: 'outline' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Shop clothing' })).toHaveAttribute('href', '#clothing');
  },
};

export const FullWidth = {
  args: { full_width: true },
  play: pressable('Add to cart'),
};

export const Disabled = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Add to cart' })).toBeDisabled();
  },
};

export const Busy = {
  args: { busy: true },
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Add to cart' });
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await expect(button).toBeDisabled();
  },
};

export const DisabledLink = {
  args: { label: 'Shop clothing', url: '#clothing', disabled: true },
  play: async ({ canvas }) => {
    const link = canvas.getByRole('link', { name: 'Shop clothing' });
    await expect(link).toHaveAttribute('aria-disabled', 'true');
    await expect(link).not.toHaveAttribute('href');
  },
};
