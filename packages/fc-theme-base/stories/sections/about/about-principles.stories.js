import { expect } from 'storybook/test';
import { image, phaseHeading } from '../../fixtures.js';
import { section } from '../../liquid.js';

const text = (id, value, style) => ({ id, type: 'text', settings: { text: `<p>${value}</p>`, style } });
const feature = (id, icon, label, detail) => ({ id, type: 'feature', settings: { icon, label, detail } });

/**
 * `sections/about-principles.liquid`: what the shop stands for, as feature blocks with their icons above the text,
 * then a warehouse photo beside how it operates and the company behind it.
 */
export default {
  title: 'Sections/About/Principles',
  parameters: { layout: 'fullscreen' },
  render: section('about-principles', {
    staticBlocks: [
      phaseHeading('Ready', 'Prêts'),
      text('lead', 'Before the bout, you settle into your stance. Here’s ours.', 'body'),
      { id: 'operations_image', type: 'image', settings: { image: image('collection-fencing-socks-2-pack.jpg', 'Stock on the warehouse shelves'), aspect_ratio: 'landscape' } },
      text('operations_eyebrow', 'How we operate', 'eyebrow'),
      { id: 'operations_heading', type: 'heading', settings: { heading: 'Our own stock, our own team', tag: 'h3', size: 'md' } },
      text('operations_start', 'We hold our own inventory rather than dropship.', 'lead'),
      text('operations_end', 'Our own team handles every question, order and return.', 'lead'),
      text('company', 'Fencing Club is operated by Fencing Club LLC, a Washington limited liability company.', 'subtle'),
    ],
    blocks: [
      feature('built-for-clubs', 'users', 'Built for clubs', 'Member pricing, team kits, and club drop-off.'),
      feature('fair-pricing', 'tag', 'Fair pricing', 'Short supply chains keep prices down.'),
      feature('direct-sourcing', 'git-branch', 'Direct sourcing', 'We buy straight from authorized makers.'),
      feature('real-support', 'life-buoy', 'Real support', 'Guidance from people who actually fence.'),
    ],
  }),
};

export const Principles = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'Prêts' })).toBeVisible();
    await expect(canvas.getByText('Before the bout, you settle into your stance. Here’s ours.')).toBeVisible();
    for (const label of ['Built for clubs', 'Fair pricing', 'Direct sourcing', 'Real support']) await expect(canvas.getByText(label)).toBeVisible();
    await expect(canvas.getByText('How we operate')).toBeVisible();
    await expect(canvas.getByRole('heading', { level: 3, name: 'Our own stock, our own team' })).toBeVisible();
    await expect(canvas.getByRole('img', { name: 'Stock on the warehouse shelves' })).toBeVisible();
    await expect(canvas.getByText('We hold our own inventory rather than dropship.')).toBeVisible();
    await expect(canvas.getByText('Our own team handles every question, order and return.')).toBeVisible();
    await expect(canvas.getByText(/operated by Fencing Club LLC/)).toBeVisible();
  },
};
