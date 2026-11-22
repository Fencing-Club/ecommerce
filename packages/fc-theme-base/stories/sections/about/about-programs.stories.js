import { expect, within } from 'storybook/test';
import { aboutHeader } from '../../fixtures.js';
import { section } from '../../liquid.js';

const program = (id, settings) => ({ id, type: '_program', settings });

/**
 * `sections/about-programs.liquid`: pricing for clubs, schools and teams. Each card is a `_program` block that leads
 * with its offer; a card with a badge, such as Coming soon, leads with its title instead.
 */
export default {
  title: 'Sections/About/Programs',
  parameters: { layout: 'fullscreen' },
  render: section('about-programs', {
    staticBlocks: [aboutHeader('Programs', 'Pricing built for clubs, schools, and teams', 'We help clubs, schools and nonprofits equip their athletes for less.')],
    blocks: [
      program('club-pricing', { icon: 'badge-percent', figure_prefix: 'Up to', figure: '15%', figure_caption: 'off house-brand gear', title: 'Club member pricing', text: 'Club members save on house-brand gear every day.' }),
      program('bulk', { icon: 'boxes', figure_prefix: 'Up to', figure: '10%', figure_caption: 'off orders of $1,500 or more', title: 'Bulk and team kitting', text: 'Orders of $1,500 or more unlock bulk pricing.' }),
      program('partnerships', { icon: 'plug', title: 'Club partnerships', text: 'Feature our gear on your club’s website.', badge: 'Coming soon', figure_caption: 'Partner clubs only' }),
    ],
  }),
};

export const Programs = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'Pricing built for clubs, schools, and teams' })).toBeVisible();
    const titles = canvas.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent.trim());
    await expect(titles).toEqual(['Club member pricing', 'Bulk and team kitting', 'Club partnerships']);
    const clubPricing = canvas.getByRole('heading', { name: 'Club member pricing' }).closest('.about-program');
    await expect(within(clubPricing).getByText('15%').parentElement).toHaveTextContent('Up to 15% off house-brand gear');
    const partnerships = canvas.getByRole('heading', { name: 'Club partnerships' }).closest('.about-program');
    await expect(within(partnerships).getByText('Coming soon')).toBeVisible();
    await expect(within(partnerships).getByText('Partner clubs only')).toBeVisible();
    await expect(within(partnerships).queryByText(/%/)).toBeNull();
  },
};
