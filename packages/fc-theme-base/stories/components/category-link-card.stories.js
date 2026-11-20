import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

/** `snippets/ui-category-link-card.liquid`: a text link to a collection, used in category grids. */
export default {
  title: 'Components/Category link card',
  render: (args) => `<div style="max-width: 28rem">${snippet('ui-category-link-card')(args)}</div>`,
  args: { label: 'Weapons', url: '#weapons' },
};

export const Default = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Weapons' })).toHaveAttribute('href', '#weapons');
  },
};
