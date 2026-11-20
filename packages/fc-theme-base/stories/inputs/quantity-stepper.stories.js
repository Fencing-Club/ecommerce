import { expect, waitFor } from 'storybook/test';
import { snippet } from '../liquid.js';

/**
 * `snippets/ui-quantity-stepper.liquid`: a quantity field with minus and plus buttons, run by the theme's
 * quantity-input element in global.js.
 */
export default {
  title: 'Inputs/Quantity stepper',
  render: snippet('ui-quantity-stepper'),
  args: { id: 'Quantity', name: 'quantity', product_title: 'Foil glove' },
};

export const Default = {
  play: async ({ canvas, userEvent }) => {
    const field = canvas.getByRole('spinbutton', { name: 'Quantity for Foil glove' });
    const decrease = canvas.getByRole('button', { name: 'Decrease quantity for Foil glove' });
    await waitFor(() => expect(decrease).toBeDisabled());
    await userEvent.click(canvas.getByRole('button', { name: 'Increase quantity for Foil glove' }));
    await expect(field).toHaveValue(2);
    await waitFor(() => expect(decrease).toBeEnabled());
    await userEvent.click(decrease);
    await expect(field).toHaveValue(1);
  },
};

export const AtMaximum = {
  args: { value: 3, max: 3 },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Increase quantity for Foil glove' })).toBeDisabled());
  },
};

export const Disabled = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('spinbutton', { name: 'Quantity for Foil glove' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Increase quantity for Foil glove' })).toBeDisabled();
  },
};
