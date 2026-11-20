import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

const value = (name, { available = true, selected = false, color } = {}) => ({
  name,
  available,
  selected,
  swatch: color ? { color } : null,
});

/**
 * `snippets/ui-variant-picker.liquid`: one product option as a group of choices under a legend, taking a Shopify
 * product_option. Text options render choices and colour options swatches.
 */
export default {
  title: 'Inputs/Variant picker',
  render: snippet('ui-variant-picker'),
  args: {
    option: {
      name: 'Size',
      position: 1,
      values: [value('S'), value('M', { selected: true }), value('L'), value('XL', { available: false })],
    },
  },
};

export const Choices = {
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('group', { name: 'Size' })).toBeVisible();
    const medium = canvas.getByRole('radio', { name: 'M' });
    await expect(medium).toBeChecked();
    await expect(medium).toHaveAttribute('name', 'options[Size]');
    await expect(canvas.getByRole('radio', { name: 'XL' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('radio', { name: 'L' }));
    await expect(canvas.getByRole('radio', { name: 'L' })).toBeChecked();
  },
};

export const Swatches = {
  args: {
    style: 'swatch',
    option: {
      name: 'Colour',
      position: 2,
      values: [
        value('Black', { selected: true, color: '#101012' }),
        value('White', { color: '#ffffff' }),
        value('Navy', { available: false, color: '#1e2a4a' }),
      ],
    },
  },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('group', { name: 'Colour Black' })).toBeVisible();
    await expect(canvas.getByRole('radio', { name: 'Navy' })).toBeDisabled();
    const white = canvas.getByRole('radio', { name: 'White' });
    await userEvent.click(white);
    await expect(white).toBeChecked();
  },
};
