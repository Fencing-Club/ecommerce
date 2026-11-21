import { expect, within } from 'storybook/test';
import { section, settings } from '../../liquid.js';

const topic = (id, title) => ({ id, type: '_faq-topic', settings: { title } });
const question = (id, text, answer, extra = {}) => ({
  id,
  type: '_faq-item',
  settings: { question: text, answer: `<p>${answer}</p>`, open: false, ...extra },
});

const blocks = [
  topic('shipping', 'Shipping'),
  question('track', 'How do I track my order?', 'We email you a tracking link as soon as your order ships.', { open: true }),
  question('dispatch', 'How quickly are orders dispatched?', 'Orders placed by 1pm Pacific time, Monday to Friday, go out the same day.'),
  topic('returns', 'Returns'),
  question('free', 'Are returns free?', 'Returns within 30 days are free in the US.', {
    link_label: 'Read the returns policy',
    link_url: '/policies/refund-policy',
  }),
  topic('sizing', 'Sizing & gear'),
  question('size', 'Which size should I choose?', 'Measure yourself and compare with the size chart on the product page.'),
];

const variables = { page: { title: 'FAQ' }, routes: { root_url: '/' }, settings: { ...settings, structured_data_enabled: false } };

/**
 * `sections/faq.liquid`: the FAQ page. `_faq-topic` blocks head the questions after them and fill the topic links;
 * `_faq-item` blocks are the questions, shown through `ui-faq-item`.
 */
export default {
  title: 'Sections/FAQ/FAQ',
  parameters: { layout: 'fullscreen' },
  render: section('faq', { blocks, variables }),
};

export const Default = {
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Frequently asked questions' })).toBeVisible();

    const topics = canvas.getByRole('navigation', { name: 'FAQ topics' });
    const links = within(topics).getAllByRole('link');
    await expect(links.map((link) => link.textContent)).toEqual(['Shipping', 'Returns', 'Sizing & gear']);
    for (const link of links) {
      const heading = canvas.getByRole('heading', { level: 2, name: link.textContent });
      await expect(link).toHaveAttribute('href', `#${heading.id}`);
    }

    await expect(canvas.getByText('We email you a tracking link as soon as your order ships.')).toBeVisible();
    const dispatch = canvas.getByText('How quickly are orders dispatched?');
    await expect(canvas.getByText(/Orders placed by 1pm/)).not.toBeVisible();
    await userEvent.click(dispatch);
    await expect(canvas.getByText(/Orders placed by 1pm/)).toBeVisible();

    await expect(canvas.getByRole('heading', { name: 'Questions?' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
  },
};
