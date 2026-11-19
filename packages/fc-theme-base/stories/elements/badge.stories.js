import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

/** `snippets/ui-badge.liquid`: a short status label. */
export default {
  title: 'Elements/Badge',
  render: snippet('ui-badge'),
  args: { label: 'New' },
};

export const Default = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('New')).toHaveClass('ui-badge');
  },
};
