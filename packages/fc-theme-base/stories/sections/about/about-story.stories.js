import { expect } from 'storybook/test';
import { aboutHeader } from '../../fixtures.js';
import { section } from '../../liquid.js';

const paragraph = (id, text) => ({ id, type: 'text', settings: { text: `<p>${text}</p>`, style: 'lead' } });

/** `sections/about-story.liquid`: how the shop began. The hero's "Read our story" button points at it. */
export default {
  title: 'Sections/About/Story',
  parameters: { layout: 'fullscreen' },
  render: section('about-story', {
    staticBlocks: [aboutHeader('Our story', 'It started at the clubs')],
    blocks: [
      paragraph('first', 'We started Fencing Club in 2023, after years of visiting clubs around the world.'),
      paragraph('second', 'Cost and access should never stand between a fencer and the sport.'),
    ],
  }),
};

export const Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'It started at the clubs' })).toBeVisible();
    await expect(canvas.getByText(/We started Fencing Club in 2023/)).toBeVisible();
    await expect(canvas.getByText(/Cost and access should never stand/)).toBeVisible();
    await expect(canvasElement.querySelector('#our-story')).toContainElement(canvas.getByRole('heading', { level: 2 }));
  },
};
