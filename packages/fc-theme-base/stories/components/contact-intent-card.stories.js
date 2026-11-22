import { expect } from 'storybook/test';
import { assetUrl, renderLiquid } from '../liquid.js';

// The topics templates/page.contact.json sets up.
const topics = [
  ['package', 'Orders & shipping', 'Track, change or ask about an order.', 'orders'],
  ['ruler', 'Sizing & fit', 'Size charts and fit advice for every weapon.', 'sizing'],
  ['rotate-ccw', 'Returns & exchanges', 'Free 30-day returns and swaps.', 'returns'],
  ['users', 'Club & school supply', 'Bulk kit, loaners and fittings.', 'clubs'],
  ['mic', 'Product & press', 'Wholesale, media and partnerships.', 'press'],
  ['message-circle', 'Everything else', 'General questions. Just ask.', 'other'],
];
const card = ([icon, title, description, topic]) => renderLiquid('ui-contact-intent-card', { icon, title, description, topic });
const styles = `<link rel="stylesheet" href="${assetUrl('section-contact-form.css')}">`;

/** `snippets/ui-contact-intent-card.liquid`: a Contact page topic that jumps to the form and picks the topic. */
export default { title: 'Components/Contact intent card' };

export const Default = {
  render: () => `${styles}<div style="max-width: 30rem">${card(topics[0])}</div>`,
  play: async ({ canvas }) => {
    const link = canvas.getByRole('link', { name: /Orders & shipping/ });
    await expect(link).toHaveAttribute('href', '#ContactFormCard');
    await expect(link).toHaveAttribute('data-contact-topic', 'orders');
  },
};

export const ContactPage = {
  render: () =>
    `${styles}<div class="contact-page" style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2.4rem">${topics.map(card).join('')}</div>`,
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('link')).toHaveLength(topics.length);
  },
};
