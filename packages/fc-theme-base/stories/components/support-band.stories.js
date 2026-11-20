import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

/** `snippets/ui-support-band.liquid`: the dark closing band on the FAQ, 404 and help pages. */
export default {
  title: 'Components/Support band',
  render: snippet('ui-support-band', { stylesheets: ['component-support-band.css'] }),
  args: {
    heading: 'Questions?',
    text: 'Cannot find the answer you are looking for? Contact us. We are happy to help.',
    primary_label: 'Contact us',
    primary_url: '#contact',
  },
};

export const OneAction = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: 'Questions?', level: 2 })).toBeVisible();
    await expect(canvas.getAllByRole('link')).toHaveLength(1);
  },
};

export const TwoActions = {
  args: {
    heading: 'Looking for something we no longer stock?',
    text: "Tell us the model and we'll tell you what replaced it, or find you the closest equivalent.",
    secondary_label: 'Browse all gear',
    secondary_url: '#all',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Browse all gear' })).toHaveAttribute('href', '#all');
  },
};
