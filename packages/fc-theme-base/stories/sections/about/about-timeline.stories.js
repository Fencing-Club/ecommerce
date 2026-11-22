import { expect, within } from 'storybook/test';
import { phaseHeading } from '../../fixtures.js';
import { section } from '../../liquid.js';

const milestone = (id, date, title, text, status = 'done') => ({ id, type: '_milestone', settings: { date, title, text, status } });

/** `sections/about-timeline.liquid`: the shop's journey. Each step is a `_milestone` block, done, in progress or planned; planned ones are muted. */
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
      milestone('masks', 'Late 2026', 'Certified mask range', 'Our own 350N and 1600N masks for epee, sabre and foil.', 'in_progress'),
      milestone('blades', '2027', 'UNIC FIE blades', 'We begin carrying UNIC FIE homologated blades.', 'planned'),
      milestone('uniform', '2027', 'An 800N uniform', 'An 800N competition uniform completes the kit.', 'planned'),
    ],
  }),
};

export const Timeline = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'Allez' })).toBeVisible();
    const steps = canvas.getAllByRole('heading', { level: 3 }).slice(1);
    await expect(steps.map((step) => step.textContent.trim())).toEqual(['Fencing Club is founded', 'An authorized dealer', 'Certified mask range', 'UNIC FIE blades', 'An 800N uniform']);
    await expect(canvas.getAllByText('Planned')).toHaveLength(2);
    const masks = canvas.getByRole('heading', { name: 'Certified mask range' }).parentElement;
    await expect(within(masks).getByText('In progress')).toBeVisible();
    const founded = canvas.getByRole('heading', { name: 'Fencing Club is founded' }).parentElement;
    await expect(within(founded).getByText('2023')).toBeVisible();
    await expect(within(founded).queryByText('Planned')).toBeNull();
  },
};
