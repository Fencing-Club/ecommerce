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
          { id: 'heading', type: 'heading', settings: { heading: 'We back the people building this sport.', tag: 'h3', size: 'md' } },
          { id: 'body', type: 'text', settings: { text: '<p>If you’re building something for fencers, you can sell it in our store and ship it through our distribution network.</p>', style: 'lead' } },
        ],
      },
      {
        id: 'panel',
        type: 'group',
        settings: { direction: 'column', gap: 'lg' },
        blocks: [
          { id: 'statement', type: 'heading', settings: { heading: 'Tell us what you’re building.', tag: 'h3', size: 'md' } },
          { id: 'body', type: 'text', settings: { text: '<p>Ask about selling with us or shipping through our network, or just say hello.</p>', style: 'lead' } },
        ],
      },
      button('action', 'Get in touch', '/pages/contact', 'primary'),
    ],
  }),
};

export const Closing = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'La belle' })).toBeVisible();
    await expect(canvas.getByRole('heading', { level: 3, name: 'We back the people building this sport.' })).toBeVisible();
    await expect(canvas.getByRole('heading', { level: 3, name: 'Tell us what you’re building.' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Get in touch' })).toHaveAttribute('href', '/pages/contact');
  },
};
