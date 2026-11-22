import { expect } from 'storybook/test';
import { aboutHeader } from '../../fixtures.js';
import { section } from '../../liquid.js';

const paragraph = (id, text) => ({ id, type: 'text', settings: { text: `<p>${text}</p>`, style: 'lead' } });

/** `sections/about-story.liquid`: how the shop began. The hero's "Read our story" button points at it. */
export default {
  title: 'Sections/About/Story',
  parameters: { layout: 'fullscreen' },
  render: section('about-story', {
    staticBlocks: [aboutHeader('Our story', 'It started in other people’s clubs')],
    blocks: [
      paragraph('first', 'Before Fencing Club, we spent years visiting fencing clubs around the world.'),
      paragraph('second', 'Cost and access should never stand between a fencer and the sport.'),
    ],
  }),
};

export const Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'It started in other people’s clubs' })).toBeVisible();
    await expect(canvas.getByText(/Before Fencing Club, we spent years/)).toBeVisible();
    await expect(canvas.getByText(/Cost and access should never stand/)).toBeVisible();
    await expect(canvasElement.querySelector('#our-story')).toContainElement(canvas.getByRole('heading', { level: 2 }));
  },
};
