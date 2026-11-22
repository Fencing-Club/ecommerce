import { expect } from 'storybook/test';
import { phaseHeading } from '../../fixtures.js';
import { section } from '../../liquid.js';

const button = (id, label, link, style) => ({ id, type: 'button', settings: { label, link, style, size: 'lg' } });

/** `sections/about-closing.liquid`: the About page's last chapter, an invitation to get in touch, on a dark panel. */
export default {
  title: 'Sections/About/Closing',
  parameters: { layout: 'fullscreen' },
  render: section('about-closing', {
    staticBlocks: [
      phaseHeading('The deciding touch', 'La belle'),
      {
        id: 'intro',
        type: 'group',
        settings: { direction: 'column', gap: 'md' },
        blocks: [
          { id: 'heading', type: 'heading', settings: { heading: 'We’re just getting started.', tag: 'h3', size: 'md' } },
          { id: 'body', type: 'text', settings: { text: '<p>There’s more to come, from our own certified masks to a platform for clubs, and we’d love to build it with the fencing community.</p>', style: 'lead' } },
        ],
      },
      {
        id: 'panel',
        type: 'group',
        settings: { direction: 'column', gap: 'lg' },
        blocks: [
          { id: 'statement', type: 'heading', settings: { heading: 'We back the people building this sport.', tag: 'h3', size: 'md' } },
          { id: 'body', type: 'text', settings: { text: '<p>If you’re making gear, building an app, or want to reach fencers through our sales channel, we can sell it in our store and ship it through our distribution network. Tell us what you’re working on.</p>', style: 'lead' } },
        ],
      },
      button('action', 'Get in touch', '/pages/contact', 'primary'),
    ],
  }),
};

export const Closing = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'La belle' })).toBeVisible();
    await expect(canvas.getByRole('heading', { level: 3, name: 'We’re just getting started.' })).toBeVisible();
    await expect(canvas.getByRole('heading', { level: 3, name: 'We back the people building this sport.' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Get in touch' })).toHaveAttribute('href', '/pages/contact');
  },
};
