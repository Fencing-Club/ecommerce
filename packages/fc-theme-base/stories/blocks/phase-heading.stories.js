import { expect } from 'storybook/test';
import { block } from '../liquid.js';

/** `blocks/phase-heading.liquid`: a referee's call in large type, its English meaning above and a rule under, opening an About page chapter. */
export default {
  title: 'Blocks/Phase heading',
  render: block('phase-heading'),
  args: { meaning: 'Ready', word: 'Prêts', tag: 'h2' },
  argTypes: { tag: { control: 'inline-radio', options: ['h2', 'h3', 'p'] } },
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
