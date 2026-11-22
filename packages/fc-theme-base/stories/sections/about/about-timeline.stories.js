import { expect, within } from 'storybook/test';
import { phaseHeading } from '../../fixtures.js';
import { section } from '../../liquid.js';

const milestone = (id, date, title, text, planned = false) => ({ id, type: '_milestone', settings: { date, title, text, planned } });

/** `sections/about-timeline.liquid`: the shop's journey. Each step is a `_milestone` block; planned ones are muted. */
export default {
  title: 'Sections/About/Timeline',
  parameters: { layout: 'fullscreen' },
  render: section('about-timeline', {
    staticBlocks: [
      phaseHeading('Phase 02', 'Go, the journey so far', 'Allez'),
      { id: 'lead', type: 'heading', settings: { heading: 'Allez, and we have not stopped moving since.', tag: 'h3', size: 'sm' } },
    ],
    blocks: [
      milestone('founded', '2023', 'Fencing Club is founded', 'A fencing-only retailer launches in Woodinville.'),
      milestone('dealer', '2024', 'An authorized dealer', 'We become an authorized dealer, sourced direct.'),
      milestone('blades', 'Late 2026', 'UNIC FIE blades', 'We begin carrying UNIC FIE homologated blades.', true),
      milestone('uniform', '2027', 'An 800N uniform', 'An 800N competition uniform completes the kit.', true),
    ],
  }),
};

export const Timeline = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'Allez' })).toBeVisible();
    const steps = canvas.getAllByRole('heading', { level: 3 }).slice(1);
    await expect(steps.map((step) => step.textContent.trim())).toEqual(['Fencing Club is founded', 'An authorized dealer', 'UNIC FIE blades', 'An 800N uniform']);
    await expect(canvas.getAllByText('Planned')).toHaveLength(2);
    const founded = canvas.getByRole('heading', { name: 'Fencing Club is founded' }).parentElement;
    await expect(within(founded).getByText('2023')).toBeVisible();
    await expect(within(founded).queryByText('Planned')).toBeNull();
  },
};
