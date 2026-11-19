import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

/** `snippets/ui-faq-item.liquid`: one question and answer that opens in place. */
export default {
  title: 'Components/FAQ item',
  render: snippet('ui-faq-item', { stylesheets: ['section-faq.css'] }),
  args: {
    question: 'Which size should I choose?',
    answer: '<p>Measure your chest and compare it with the size chart for the product.</p>',
  },
};

export const Closed = {
  play: async ({ canvas, userEvent }) => {
    const question = canvas.getByText('Which size should I choose?');
    await expect(canvas.getByText(/Measure your chest/)).not.toBeVisible();
    await userEvent.click(question);
    await expect(canvas.getByText(/Measure your chest/)).toBeVisible();
  },
};

export const Open = {
  args: { open: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Measure your chest/)).toBeVisible();
  },
};

export const WithLink = {
  args: { open: true, link_label: 'Size charts', link_url: '#size-charts' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Size charts' })).toHaveAttribute('href', '#size-charts');
  },
};
