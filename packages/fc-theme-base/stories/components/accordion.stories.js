import { expect, waitFor } from 'storybook/test';
import { loadScript, snippet } from '../liquid.js';

/** Waits for the accordion's motion to end, so the accessibility check reads final colors, not a frame partway. */
const settled = (element) => Promise.all(element.closest('details').getAnimations({ subtree: true }).map((animation) => animation.finished));

/**
 * `snippets/ui-accordion.liquid`: a disclosure that opens in place with the shared motion from `motion.js`, the content
 * growing in and fading, and shrinking and fading out. The summary ends in a chevron that turns over, or a plus that
 * turns to minus. Filter groups and FAQ items are built on it.
 */
export default {
  title: 'Components/Accordion',
  loaders: [loadScript('motion.js')],
  render: snippet('ui-accordion'),
  args: {
    summary: '<h3 style="margin: 0; font-size: 1.4rem">Size</h3>',
    content: '<p style="margin: 0">Pick the size that matches your chest measurement.</p>',
  },
  decorators: [(story) => `<div style="max-width: 32rem">${story()}</div>`],
};

export const Closed = {
  play: async ({ canvas, userEvent }) => {
    const summary = canvas.getByRole('heading', { name: 'Size' });
    await expect(canvas.getByText(/Pick the size/)).not.toBeVisible();
    await userEvent.click(summary);
    await waitFor(() => expect(canvas.getByText(/Pick the size/)).toBeVisible());
    await userEvent.click(summary);
    await waitFor(() => expect(canvas.getByText(/Pick the size/)).not.toBeVisible());
  },
};

export const Open = {
  args: { open: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Pick the size/)).toBeVisible();
  },
};

/** A plus that turns to minus, as the buying guide's questions use. */
export const Plus = {
  args: { indicator: 'plus' },
  play: async ({ canvas, userEvent }) => {
    const summary = canvas.getByRole('heading', { name: 'Size' });
    await userEvent.click(summary);
    await waitFor(() => expect(canvas.getByText(/Pick the size/)).toBeVisible());
    await settled(summary);
  },
};
