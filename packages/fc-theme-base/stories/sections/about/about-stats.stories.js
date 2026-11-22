import { expect } from 'storybook/test';
import { phaseHeading } from '../../fixtures.js';
import { section } from '../../liquid.js';

const stat = (id, number, label) => ({ id, type: '_stat', settings: { number, label } });

/** `sections/about-stats.liquid`: the shop's numbers on a dark band. Each figure is a `_stat` block. */
export default {
  title: 'Sections/About/Stats',
  parameters: { layout: 'fullscreen' },
  render: section('about-stats', {
    staticBlocks: [
      phaseHeading('A touch lands', 'Touché'),
      {
        id: 'header',
        type: 'group',
        settings: { direction: 'column', gap: 'sm' },
        blocks: [
          { id: 'heading', type: 'heading', settings: { heading: 'Measured, not marketed.', tag: 'h3', size: 'lg' } },
        ],
      },
      { id: 'caption', type: 'text', settings: { text: '<p>Most of what we sell is our own brand.</p>', style: 'subtle' } },
    ],
    blocks: [stat('orders', '9,700+', 'Orders shipped'), stat('fencers', '7,400+', 'Fencers equipped'), stat('middlemen', '0', 'Middlemen')],
  }),
};

export const Stats = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'Touché' })).toBeVisible();
    await expect(canvas.getByRole('heading', { level: 3, name: 'Measured, not marketed.' })).toBeVisible();
    await expect(canvas.getByText('Most of what we sell is our own brand.')).toBeVisible();
    for (const [number, label] of [['9,700+', 'Orders shipped'], ['7,400+', 'Fencers equipped'], ['0', 'Middlemen']]) {
      await expect(canvas.getByText(label).previousElementSibling).toHaveTextContent(number);
    }
  },
};
