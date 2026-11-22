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
      phaseHeading('Fence', 'Allez'),
      { id: 'lead', type: 'heading', settings: { heading: 'We haven’t stopped moving since the first allez.', tag: 'h3', size: 'sm' } },
    ],
    blocks: [
      milestone('founded', '2023', 'Fencing Club is founded', 'A fencing-only retailer launches in Woodinville.'),
      milestone('dealer', '2024', 'Authorized dealer', 'We become an authorized dealer for four brands and buy from them directly.'),
      milestone('masks', 'Late 2026', 'Our own certified masks', 'Masks for foil, épée, and sabre, rated 350N and 1600N.', 'in_progress'),
      milestone('blades', '2027', 'FIE blades from UNIC', 'We start carrying UNIC’s FIE-homologated blades.', 'planned'),
      milestone('uniform', '2027', 'An 800N uniform', 'An 800N competition uniform completes the kit.', 'planned'),
    ],
  }),
};

export const Timeline = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'Allez' })).toBeVisible();
    const steps = canvas.getAllByRole('heading', { level: 3 }).slice(1);
    await expect(steps.map((step) => step.textContent.trim())).toEqual(['Fencing Club is founded', 'Authorized dealer', 'Our own certified masks', 'FIE blades from UNIC', 'An 800N uniform']);
    await expect(canvas.getAllByText('Planned')).toHaveLength(2);
    const masks = canvas.getByRole('heading', { name: 'Our own certified masks' }).parentElement;
    await expect(within(masks).getByText('In progress')).toBeVisible();
    const founded = canvas.getByRole('heading', { name: 'Fencing Club is founded' }).parentElement;
    await expect(within(founded).getByText('2023')).toBeVisible();
    await expect(within(founded).queryByText('Planned')).toBeNull();
  },
};
