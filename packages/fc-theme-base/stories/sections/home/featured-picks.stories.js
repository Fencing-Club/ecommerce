import { expect } from 'storybook/test';
import { image, sectionHeader } from '../../fixtures.js';
import { section } from '../../liquid.js';

const pick = (id, title, file, links) => ({
  id,
  type: '_pick-card',
  settings: { image: image(file, title), title, description: `Everything you need for ${title.toLowerCase()}.` },
  blocks: links.map((label, i) => ({ id: `${id}-link-${i}`, type: '_pick-link', settings: { label, link: `#${label.toLowerCase().replaceAll(' ', '-')}` } })),
});

/** `sections/featured-picks.liquid`: three pick cards, two stacked beside one tall. Each card is a `_pick-card` block. */
export default {
  title: 'Sections/Home/Featured picks',
  parameters: { layout: 'fullscreen' },
  render: section('featured-picks', {
    staticBlocks: [sectionHeader('Gear up your way', 'Featured picks')],
    blocks: [
      pick('kits', 'Starter kits', 'collection-fie-800n-jacket.jpg', ['Foil kits', 'Épée kits']),
      pick('weapons', 'Weapons', 'collection-grip-fencing-glove.jpg', ['Foil', 'Épée', 'Sabre']),
      pick('bags', 'Bags', 'collection-aero-competition-jacket.jpg', ['Wheel bags']),
    ],
  }),
};

export const Picks = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'Featured picks' })).toBeVisible();
    await expect(canvas.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['Starter kits', 'Weapons', 'Bags']);
    await expect(canvas.getByRole('link', { name: 'Wheel bags' })).toHaveAttribute('href', '#wheel-bags');
  },
};
