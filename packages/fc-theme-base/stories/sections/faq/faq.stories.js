import { expect, waitFor, within } from 'storybook/test';
import { faqTopic, question } from '../../fixtures.js';
import { loadScript, section, settings } from '../../liquid.js';

const topics = [
  faqTopic('Shipping', [
    question('How do I track my order?', 'We email you a tracking link as soon as your order ships.'),
    question('How quickly are orders dispatched?', 'Orders placed by 1pm Pacific time, Monday to Friday, go out the same day.'),
  ]),
  faqTopic('Returns', [question('Are returns free?', 'Returns within 30 days are free in the US.')]),
  faqTopic('Sizing & gear', [question('Which size should I choose?', 'Measure yourself and compare with the size chart on the product page.')]),
];

const variables = (faqTopics) => ({
  page: { title: 'FAQ', metafields: { custom: { faq_topics: { value: faqTopics } } } },
  pages: { contact: { url: '/pages/contact' } },
  settings: { ...settings, structured_data_enabled: false },
});

/**
 * `sections/faq.liquid`: the FAQ page. The page's FAQ topics (`custom.faq_topics`) fill the topic links and head
 * their Question entries, shown through `ui-faq-item` with each topic's first question open.
 */
export default {
  title: 'Sections/FAQ/FAQ',
  loaders: [loadScript('motion.js')],
  parameters: { layout: 'fullscreen' },
  render: section('faq', { variables: variables(topics) }),
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
    await expect(canvas.getByText('Returns within 30 days are free in the US.')).toBeVisible();
    const dispatch = canvas.getByText('How quickly are orders dispatched?');
    const answer = canvas.getByText(/Orders placed by 1pm/);
    await expect(answer).not.toBeVisible();
    await userEvent.click(dispatch);
    await waitFor(() => expect(answer).toBeVisible());
    // The answer fades in. Let it finish so the accessibility check reads its final colors, not a frame partway.
    await Promise.all(answer.closest('details').getAnimations({ subtree: true }).map((animation) => animation.finished));

    await expect(canvas.getByRole('heading', { name: 'Questions?' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Contact us' })).toHaveAttribute('href', '/pages/contact');
  },
};

export const NoTopics = {
  render: section('faq', { variables: variables(null) }),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Frequently asked questions' })).toBeVisible();
    await expect(canvas.queryByRole('navigation', { name: 'FAQ topics' })).toBeNull();
    await expect(canvas.getByRole('link', { name: 'Contact us' })).toBeVisible();
  },
};
