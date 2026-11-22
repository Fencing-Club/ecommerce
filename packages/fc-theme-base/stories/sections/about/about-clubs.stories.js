import { expect, within } from 'storybook/test';
import { aboutHeader } from '../../fixtures.js';
import { section } from '../../liquid.js';

const club = (id, discipline, name, location, link = '') => ({ id, type: '_club', settings: { discipline, name, location, link } });

/**
 * `sections/about-clubs.liquid`: the clubs the team fences at. Each club is a `_club` block, and the dark band under
 * them is the static `_clubs-callout` block.
 */
export default {
  title: 'Sections/About/Clubs',
  parameters: { layout: 'fullscreen' },
  render: section('about-clubs', {
    staticBlocks: [
      aboutHeader('Our home pistes', 'The clubs we call home', 'Most weeks you’ll find our team on the piste at these clubs.'),
      {
        id: 'callout',
        type: '_clubs-callout',
        settings: { title: 'Free order delivery to our home clubs', text: 'We’ll drop your order off free at any of them.' },
      },
    ],
    blocks: [
      club('kaizen', 'Épée', 'Kaizen Academy', 'Redmond, WA'),
      club('rain-city', 'Foil', 'Rain City Fencing Center', 'Bellevue, WA'),
      club('salle-auriol', 'Open fencing', 'Salle Auriol Seattle', 'Seattle, WA', 'https://salleauriol.com'),
    ],
  }),
};

export const Clubs = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'The clubs we call home' })).toBeVisible();
    const names = canvas.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent.trim());
    await expect(names).toEqual(['Kaizen Academy', 'Rain City Fencing Center', 'Salle Auriol Seattle', 'Free order delivery to our home clubs']);
    await expect(canvas.getByRole('link', { name: 'Visit site: Salle Auriol Seattle' })).toHaveAttribute('href', 'https://salleauriol.com');
    await expect(canvas.getAllByRole('link')).toHaveLength(1);
    const kaizen = canvas.getByRole('heading', { name: 'Kaizen Academy' }).parentElement;
    await expect(within(kaizen).getByText('Redmond, WA')).toBeVisible();
    await expect(within(kaizen).getByText('Épée')).toBeVisible();
  },
};
