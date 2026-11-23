import { expect } from 'storybook/test';
import { aboutHeader, image } from '../../fixtures.js';
import { loadStylesheet, section } from '../../liquid.js';

const paragraph = (id, text) => ({ id, type: 'text', settings: { text: `<p>${text}</p>`, style: 'lead' } });

/**
 * `sections/about-story.liquid`: how the shop began, with its belief line set as a quote and a full-width photo under
 * the text. The hero's "Read our story" button points at it.
 */
export default {
  title: 'Sections/About/Story',
  loaders: [loadStylesheet('section-about.css')],
  parameters: { layout: 'fullscreen' },
  args: { image: image('collection-aero-competition-jacket.jpg', 'Fencers training at a club') },
  render: section('about-story', {
    staticBlocks: [aboutHeader('Our story', 'It started in other people’s clubs')],
    blocks: [
      paragraph('first', 'Before Fencing Club, we spent years visiting fencing clubs around the world.'),
      { id: 'belief', type: 'text', settings: { text: '<p>Cost and access should never stand between a fencer and the sport.</p>', style: 'quote' } },
    ],
  }),
};

export const Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'It started in other people’s clubs' })).toBeVisible();
    await expect(canvas.getByText(/Before Fencing Club, we spent years/)).toBeVisible();
    await expect(canvas.getByText(/Cost and access should never stand/)).toBeVisible();
    await expect(canvas.getByRole('img', { name: 'Fencers training at a club' })).toBeVisible();
    await expect(canvasElement.querySelector('#our-story')).toContainElement(canvas.getByRole('heading', { level: 2 }));
  },
};
