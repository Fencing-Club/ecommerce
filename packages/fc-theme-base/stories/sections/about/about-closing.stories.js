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
      phaseHeading('Phase 04', 'The deciding touch', 'La belle'),
      {
        id: 'intro',
        type: 'group',
        settings: { direction: 'column', gap: 'md' },
        blocks: [
          { id: 'eyebrow', type: 'text', settings: { text: '<p>La belle, the deciding touch</p>', style: 'eyebrow' } },
          { id: 'heading', type: 'heading', settings: { heading: 'We are just getting started.', tag: 'h3', size: 'md' } },
          { id: 'body', type: 'text', settings: { text: '<p>We are glad to back the people building this sport.</p>', style: 'lead' } },
        ],
      },
      {
        id: 'panel',
        type: 'group',
        settings: { direction: 'column', gap: 'lg' },
        blocks: [
          { id: 'statement', type: 'heading', settings: { heading: 'Building something for fencing? Let’s talk.', tag: 'h3', size: 'md' } },
          { id: 'body', type: 'text', settings: { text: '<p>Sell on our platform, use our distribution, or just say hello.</p>', style: 'lead' } },
        ],
      },
      button('action', 'Get in touch', '/pages/contact', 'primary'),
    ],
  }),
};

export const Closing = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'La belle' })).toBeVisible();
    await expect(canvas.getByRole('heading', { level: 3, name: 'We are just getting started.' })).toBeVisible();
    await expect(canvas.getByRole('heading', { level: 3, name: 'Building something for fencing? Let’s talk.' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Get in touch' })).toHaveAttribute('href', '/pages/contact');
  },
};
