import { expect } from 'storybook/test';
import { block } from '../liquid.js';

/** `blocks/phase-heading.liquid`: the phase and what it means over a large word and a rule, opening an About page chapter. */
export default {
  title: 'Blocks/Phase heading',
  render: block('phase-heading'),
  args: { phase: 'Phase 01', meaning: 'Ready, what we stand for', word: 'Prêt', tag: 'h2' },
  argTypes: { tag: { control: 'inline-radio', options: ['h2', 'h3', 'p'] } },
};

export const Heading = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'Prêt' })).toBeVisible();
    await expect(canvas.getByText('Phase 01')).toBeVisible();
    await expect(canvas.getByText('Ready, what we stand for')).toBeVisible();
  },
};

export const Paragraph = {
  args: { phase: 'Phase 00', meaning: 'Take your stance', word: 'En garde', tag: 'p' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('En garde')).toBeVisible();
    await expect(canvas.queryByRole('heading')).toBeNull();
  },
};
