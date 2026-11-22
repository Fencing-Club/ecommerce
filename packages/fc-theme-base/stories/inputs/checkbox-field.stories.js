import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

/** `snippets/ui-checkbox-field.liquid`: a checkbox or radio with a whole-row label. */
export default {
  title: 'Inputs/Checkbox field',
  render: snippet('ui-checkbox-field'),
  args: { id: 'Marketing', name: 'marketing', label: 'Email me news and offers' },
};

export const Default = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText('Email me news and offers'));
    await expect(canvas.getByRole('checkbox', { name: /Email me news and offers/ })).toBeChecked();
  },
};

export const WithDescription = {
  args: { id: 'Analytics', label: 'Analytics', description: 'Helps us understand how the site is used.' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Helps us understand how the site is used.')).toBeVisible();
  },
};

export const FilterOption = {
  args: { id: 'FilterJackets', name: 'filter.p.product_type', label: 'Jackets', variant: 'filter', count: 12 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('12')).toBeVisible();
  },
};

export const Radio = {
  args: { id: 'ShippingStandard', name: 'shipping', label: 'Standard shipping', type: 'radio', checked: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('radio', { name: /Standard shipping/ })).toBeChecked();
  },
};

export const Locked = {
  args: { id: 'Necessary', label: 'Necessary', badge: 'Always on', checked: true, disabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('checkbox', { name: /Necessary/ })).toBeDisabled();
  },
};
