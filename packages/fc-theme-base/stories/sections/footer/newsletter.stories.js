import { expect } from 'storybook/test';
import { section } from '../../liquid.js';

const copy = (heading, text, tag = 'h2', size = 'lg') => [
  { id: 'heading', type: 'heading', settings: { heading, tag, size } },
  { id: 'text', type: 'text', settings: { text: `<p>${text}</p>`, style: 'subtle' } },
];

/**
 * `sections/newsletter.liquid`: the dark signup band above the footer, also the password page. Heading and text blocks
 * sit beside a static `email-signup` block.
 */
export default {
  title: 'Sections/Footer/Newsletter',
  parameters: { layout: 'fullscreen' },
};

export const SideBySide = {
  render: section('newsletter', {
    blocks: copy(
      'Get first access to new gear & restocks',
      'Join the list for early drops, limited restocks, and fitting guides. No noise, just the essentials.',
    ),
    staticBlocks: [{ id: 'signup', type: 'email-signup', settings: {} }],
  }),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'Get first access to new gear & restocks' })).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: 'Enter your email' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Subscribe' })).toBeVisible();
  },
};

/** The password page's layout. */
export const Stacked = {
  args: { layout: 'stacked' },
  render: section('newsletter', {
    blocks: copy('Opening soon', 'Be the first to know when we launch.', 'h1', 'xl'),
    staticBlocks: [{ id: 'signup', type: 'email-signup', settings: { button_label: 'Notify me', disclaimer: '' } }],
  }),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Opening soon' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Notify me' })).toBeVisible();
  },
};
