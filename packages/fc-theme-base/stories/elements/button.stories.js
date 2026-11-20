import { expect, fn } from 'storybook/test';
import iconNames from '../../scripts/icons.json';
import { snippet } from '../liquid.js';

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
  play: async ({ canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Add to cart' });
    const clicked = fn();
    button.addEventListener('click', clicked);
    await userEvent.click(button);
    await expect(clicked).toHaveBeenCalledOnce();
    await expect(button).toHaveAttribute('type', 'button');
  },
};

export const Secondary = {
  args: { label: 'Continue shopping', variant: 'secondary' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Continue shopping' })).toHaveClass('ui-button--secondary');
  },
};

export const Outline = {
  args: { label: 'Continue shopping', variant: 'outline' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Continue shopping' })).toHaveClass('ui-button--outline');
  },
};

export const Ghost = {
  args: { label: 'Clear filters', variant: 'ghost' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Clear filters' })).toHaveClass('ui-button--ghost');
  },
};

export const IconOnly = {
  args: { label: undefined, aria_label: 'Close', variant: 'icon', icon: 'x' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Close' })).toBeEnabled();
  },
};

export const TrailingIcon = {
  args: { label: 'Shop masks', trailing_icon: 'arrow-right' },
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Shop masks' });
    await expect(button.lastElementChild).toHaveClass('ui-icon');
  },
};

export const Medium = {
  args: { size: 'md' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Add to cart' })).toHaveClass('ui-button--md');
  },
};

export const Large = {
  args: { label: 'Check out', size: 'lg' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Check out' })).toHaveClass('ui-button--lg');
  },
};

export const AsLink = {
  args: { label: 'Shop clothing', url: '#clothing', variant: 'outline' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Shop clothing' })).toHaveAttribute('href', '#clothing');
  },
};

export const FullWidth = {
  args: { full_width: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Add to cart' })).toHaveClass('ui-button--full-width');
  },
};

export const Disabled = {
  args: { disabled: true, action: 'add' },
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Add to cart' });
    await expect(button).toBeDisabled();
    await expect(button).not.toHaveAttribute('data-action');
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
