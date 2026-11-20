import { expect } from 'storybook/test';
import { renderLiquid } from '../liquid.js';

const colors = [
  { label: 'Black', color: '#101012' },
  { label: 'White', color: '#ffffff' },
  { label: 'Navy', color: '#1e2a4a', disabled: true },
];

/** `snippets/ui-swatch.liquid`: a round colour option. An unavailable colour is disabled and struck through. */
export default {
  title: 'Inputs/Swatch',
  render: ({ selected }) =>
    `<fieldset><legend>Colour</legend>${colors
      .map(({ label, color, disabled }) =>
        renderLiquid('ui-swatch', { id: `Colour-${label}`, name: 'colour', value: label, label, color, disabled, checked: label === selected }),
      )
      .join('')}</fieldset>`,
  args: { selected: 'Black' },
};

export const Default = {
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('radio', { name: 'Black' })).toBeChecked();
    await userEvent.click(canvas.getByRole('radio', { name: 'White' }));
    await expect(canvas.getByRole('radio', { name: 'White' })).toBeChecked();
  },
};

export const Unavailable = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('radio', { name: 'Navy' })).toBeDisabled();
  },
};
