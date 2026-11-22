import { expect, within } from 'storybook/test';
import { aboutHeader } from '../../fixtures.js';
import { section } from '../../liquid.js';

const program = (id, settings) => ({ id, type: '_program', settings });

/** `sections/about-programs.liquid`: pricing for clubs, schools and teams. Each card is a `_program` block. */
export default {
  title: 'Sections/About/Programs',
  parameters: { layout: 'fullscreen' },
  render: section('about-programs', {
    staticBlocks: [aboutHeader('Programs we offer', 'Pricing built for clubs, schools & teams', 'We help clubs, schools and nonprofits equip their athletes for less.')],
    blocks: [
      program('club-pricing', { icon: 'badge-percent', title: 'Club member pricing', text: 'Everyday member pricing on house-brand gear.', note: 'Up to 15% off house brand' }),
      program('bulk', { icon: 'boxes', title: 'Bulk & team kitting', text: 'Orders of $1,500 or more unlock bulk pricing.', note: 'Up to 10% off' }),
      program('partnerships', { icon: 'plug', title: 'Club partnerships', text: 'Embed our sale items on your club site.', badge: 'Coming soon' }),
    ],
  }),
};

export const Programs = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'Pricing built for clubs, schools & teams' })).toBeVisible();
    const titles = canvas.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent.trim());
    await expect(titles).toEqual(['Club member pricing', 'Bulk & team kitting', 'Club partnerships']);
    await expect(canvas.getByText('Up to 15% off house brand')).toBeVisible();
    const partnerships = canvas.getByRole('heading', { name: 'Club partnerships' }).closest('.about-program');
    await expect(within(partnerships).getByText('Coming soon')).toBeVisible();
    await expect(within(partnerships).queryByText(/% off/)).toBeNull();
  },
};
