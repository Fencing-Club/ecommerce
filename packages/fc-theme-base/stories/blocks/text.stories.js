import { expect } from 'storybook/test';
import { block } from '../liquid.js';

/** `blocks/text.liquid`: rich text in the body, lead, subtle or eyebrow style. */
export default {
  title: 'Blocks/Text',
  render: block('text'),
  args: {
    text: '<p>We stock competition-grade foil, épée and sabre equipment, tested by national-team fencers.</p>',
    style: 'body',
    alignment: 'left',
  },
  argTypes: {
    style: { control: 'inline-radio', options: ['body', 'lead', 'subtle', 'eyebrow'] },
    alignment: { control: 'inline-radio', options: ['left', 'center', 'right'] },
  },
};

export const Body = {
  args: {
    text: '<p>We stock competition-grade foil, épée and sabre equipment.</p><p>Read our <a href="#sizing">sizing guide</a> before you order.</p>',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('We stock competition-grade foil, épée and sabre equipment.')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'sizing guide' })).toHaveAttribute('href', '#sizing');
  },
};

export const Lead = {
  args: { text: '<p>A specialty shop serving clubs, schools and individual athletes.</p>', style: 'lead' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('A specialty shop serving clubs, schools and individual athletes.')).toBeVisible();
  },
};

export const Subtle = {
  args: { text: '<p>Ships in 1 business day.</p>', style: 'subtle' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Ships in 1 business day.')).toBeVisible();
  },
};

export const Eyebrow = {
  args: { text: '<p>Featured products</p>', style: 'eyebrow' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Featured products')).toBeVisible();
  },
};

export const Centered = {
  args: { alignment: 'center' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/competition-grade foil/)).toBeVisible();
  },
};
