import { expect } from 'storybook/test';
import { renderLiquid } from '../liquid.js';

/** `snippets/ui-segmented-control.liquid`: a short set of exclusive options, such as the size chart's units. */
export default {
  title: 'Inputs/Segmented control',
  render: (args) => `<fieldset><legend>Units</legend>${renderLiquid('ui-segmented-control', args)}</fieldset>`,
  args: { name: 'unit', options: ['cm', 'in'], selected: 'cm' },
};

export const Default = {
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('radio', { name: 'cm' })).toBeChecked();
    await userEvent.click(canvas.getByText('in'));
    await expect(canvas.getByRole('radio', { name: 'in' })).toBeChecked();
  },
};
