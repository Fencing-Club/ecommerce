import { expect } from 'storybook/test';
import { block } from '../liquid.js';

/**
 * `blocks/phase-heading.liquid`: a referee's call opening an About page chapter. The call style sets it in very large
 * type, its English meaning above and a rule under; the eyebrow style, for the hero, is a short rule and the call in
 * small capitals.
 */
export default {
  title: 'Blocks/Phase heading',
  render: block('phase-heading'),
  args: { meaning: 'Ready', word: 'Prêts', tag: 'h2', style: 'call' },
  argTypes: {
    tag: { control: 'inline-radio', options: ['h2', 'h3', 'p'] },
    style: { control: 'inline-radio', options: ['call', 'eyebrow'] },
  },
};

export const Heading = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'Prêts' })).toBeVisible();
    await expect(canvas.getByText('Ready')).toBeVisible();
  },
};

export const Paragraph = {
  args: { meaning: 'On guard', word: 'En garde', tag: 'p' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('En garde')).toBeVisible();
    await expect(canvas.queryByRole('heading')).toBeNull();
  },
};

export const Eyebrow = {
  args: { meaning: 'On guard', word: 'En garde', tag: 'p', style: 'eyebrow' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('En garde')).toBeVisible();
    await expect(canvas.queryByRole('heading')).toBeNull();
  },
};
