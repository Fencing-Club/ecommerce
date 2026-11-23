import { expect, within } from 'storybook/test';
import { question } from '../../fixtures.js';
import { section } from '../../liquid.js';

const topic = (id, icon, title, description) => ({ id, type: '_contact-topic', settings: { icon, title, description, topic: title } });

const staticBlocks = [
  {
    id: 'topics',
    type: '_contact-topics',
    settings: {},
    blocks: [
      topic('orders', 'package', 'Orders & shipping', 'Track, change or ask about an order.'),
      topic('sizing', 'ruler', 'Sizing & fit', 'Size charts and fit advice for every weapon.'),
      topic('returns', 'rotate-ccw', 'Returns & exchanges', 'Free 30-day returns and swaps.'),
    ],
  },
  {
    id: 'answers',
    type: '_contact-answers',
    settings: {},
  },
];

const questions = [
  question('Where is my order?', 'Sign in to view your order history and tracking.'),
  question('Can I change my size?', 'Start a free return within 30 days, then order the size you need.'),
];
const variables = { page: { title: 'Contact', metafields: { custom: { questions: { value: questions } } } }, pages: { faq: { url: '/pages/faq' } } };

/**
 * `sections/contact-form.liquid`: the Contact page. The static `_contact-topics` block holds the `_contact-topic`
 * cards, the form and direct contact details follow, and the static `_contact-answers` block shows the Question
 * entries the page links in `custom.questions` as quick answers, then the FAQ link.
 */
export default {
  title: 'Sections/Contact/Contact form',
  parameters: { layout: 'fullscreen' },
  render: section('contact-form', { staticBlocks, variables }),
};

export const Default = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'How can we help?' })).toBeVisible();

    const topics = canvas.getByRole('navigation', { name: 'Contact topics' });
    await expect(within(topics).getAllByRole('link')).toHaveLength(3);
    await expect(within(topics).getByRole('link', { name: /Sizing & fit/ })).toHaveAttribute('data-contact-topic', 'Sizing & fit');

    await expect(canvas.getByRole('textbox', { name: 'Name' })).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: /Email/ })).toBeRequired();
    await expect(canvas.getByRole('textbox', { name: 'Anything we should know?' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Send message' })).toBeVisible();

    const answers = canvas.getByRole('region', { name: 'A few quick answers' });
    await expect(within(answers).getByRole('heading', { level: 3, name: 'Where is my order?' })).toBeVisible();
    await expect(within(answers).getByText('Start a free return within 30 days, then order the size you need.')).toBeVisible();
    await expect(within(answers).getByRole('link', { name: 'Read our full FAQ' })).toHaveAttribute('href', '/pages/faq');
  },
};
