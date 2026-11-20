import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

/** `snippets/ui-page-link-card.liquid`: a card linking to an information page, such as Contact or Shipping. */
export default {
  title: 'Components/Page link card',
  render: (args) => `<div style="max-width: 32rem">${snippet('ui-page-link-card')(args)}</div>`,
  args: { title: 'Contact us', description: 'Get help choosing the right gear.', url: '#contact' },
};

export const Default = {
  play: async ({ canvas }) => {
    const link = canvas.getByRole('link', { name: /Contact us/ });
    await expect(link).toHaveAttribute('href', '#contact');
    await expect(link).toHaveTextContent('Get help choosing the right gear.');
  },
};
