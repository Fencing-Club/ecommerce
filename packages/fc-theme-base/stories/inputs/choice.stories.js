import { expect } from 'storybook/test';
import { renderLiquid } from '../liquid.js';

const sizes = ['S', 'M', 'L', 'XL'];

/**
 * `snippets/ui-choice.liquid`: one option of a set, such as a variant size or a filter value. A set renders one choice
 * per option.
 */
export default {
  title: 'Inputs/Choice',
  render: ({ type, selected, unavailable }) =>
    `<fieldset><legend>Size</legend>${sizes
      .map((size) =>
        renderLiquid('ui-choice', {
          type,
          id: `Size-${size}`,
          name: 'size',
          value: size,
          label: size,
          checked: size === selected,
          disabled: size === unavailable,
        }),
      )
      .join('')}</fieldset>`,
  args: { type: 'radio', selected: 'M', unavailable: 'XL' },
};

export const Radio = {
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('radio', { name: 'M' })).toBeChecked();
    await expect(canvas.getByRole('radio', { name: 'XL' })).toBeDisabled();
    await userEvent.click(canvas.getByText('L'));
    await expect(canvas.getByRole('radio', { name: 'L' })).toBeChecked();
  },
};

export const Checkbox = {
  args: { type: 'checkbox', selected: undefined, unavailable: undefined },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText('S'));
    await userEvent.click(canvas.getByText('L'));
    await expect(canvas.getByRole('checkbox', { name: 'S' })).toBeChecked();
    await expect(canvas.getByRole('checkbox', { name: 'L' })).toBeChecked();
  },
};

export const Button = {
  args: { type: 'button', selected: 'M', unavailable: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'M' })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('button', { name: 'S' })).toHaveAttribute('aria-pressed', 'false');
  },
};
