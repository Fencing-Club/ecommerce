import { expect } from 'storybook/test';
import { block } from '../liquid.js';

const heading = { id: 'heading', type: 'heading', settings: { heading: 'Best sellers', tag: 'h2' } };
const eyebrow = { id: 'eyebrow', type: 'text', settings: { text: '<p>Featured products</p>', style: 'eyebrow' } };
const shop = { id: 'shop', type: 'button', settings: { label: 'Shop all', link: '#all' } };
const advice = { id: 'advice', type: 'button', settings: { label: 'Get advice', link: '#advice', style: 'outline' } };

/** `blocks/group.liquid`: lays out the blocks inside it in a column or a row. */
export default {
  title: 'Blocks/Group',
  args: { direction: 'column', gap: 'md', align: 'stretch', justify: 'start' },
  argTypes: {
    direction: { control: 'inline-radio', options: ['column', 'row'] },
    gap: { control: 'inline-radio', options: ['sm', 'md', 'lg', 'xl'] },
    align: { control: 'inline-radio', options: ['start', 'center', 'end', 'stretch'] },
    justify: { control: 'inline-radio', options: ['start', 'center', 'end', 'between'] },
  },
};

export const Column = {
  render: block('group', {
    blocks: [eyebrow, heading, { id: 'body', type: 'text', settings: { text: '<p>Gear our customers order most.</p>' } }, shop],
  }),
  args: { align: 'start' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Featured products')).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Best sellers', level: 2 })).toBeVisible();
    await expect(canvas.getByText('Gear our customers order most.')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Shop all' })).toHaveAttribute('href', '#all');
  },
};

export const Row = {
  render: block('group', { blocks: [shop, advice] }),
  args: { direction: 'row', gap: 'sm', align: 'center' },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('link').map((link) => link.textContent.trim())).toEqual(['Shop all', 'Get advice']);
  },
};

export const Nested = {
  render: block('group', {
    blocks: [heading, { id: 'actions', type: 'group', settings: { direction: 'row', gap: 'sm' }, blocks: [shop, advice] }],
  }),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: 'Best sellers' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Shop all' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Get advice' })).toBeVisible();
  },
};
