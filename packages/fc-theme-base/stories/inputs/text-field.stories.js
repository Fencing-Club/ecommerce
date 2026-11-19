import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

/** `snippets/ui-text-field.liquid`: a labeled single-line or multiline text input. */
export default {
  title: 'Inputs/Text field',
  render: snippet('ui-text-field'),
  args: { id: 'ContactName', name: 'contact[name]', label: 'Name', autocomplete: 'name' },
};

export const Default = {
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole('textbox', { name: 'Name' });
    await userEvent.type(input, 'Sam Rivera');
    await expect(input).toHaveValue('Sam Rivera');
  },
};

export const Email = {
  args: { id: 'ContactEmail', name: 'contact[email]', label: 'Email', type: 'email', autocomplete: 'email', required: true },
  play: async ({ canvas }) => {
    const input = canvas.getByRole('textbox', { name: 'Email' });
    await expect(input).toHaveAttribute('type', 'email');
    await expect(input).toBeRequired();
  },
};

export const Multiline = {
  args: { id: 'ContactMessage', name: 'contact[body]', label: 'Message', multiline: true, rows: 5 },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox', { name: 'Message' }).tagName).toBe('TEXTAREA');
  },
};

export const WithPrefix = {
  args: { id: 'PriceMin', name: 'filter.v.price.gte', label: 'From', prefix: '$', inputmode: 'decimal' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox', { name: 'From ($)' })).toHaveAttribute('inputmode', 'decimal');
  },
};

export const Invalid = {
  args: { invalid: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox', { name: 'Name' })).toBeInvalid();
  },
};

export const Disabled = {
  args: { disabled: true, value: 'Sam Rivera' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox', { name: 'Name' })).toBeDisabled();
  },
};
