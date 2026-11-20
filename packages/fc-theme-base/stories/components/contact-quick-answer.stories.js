import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

/** `snippets/ui-contact-quick-answer.liquid`: a short question and answer under the Contact form. */
export default {
  title: 'Components/Contact quick answer',
  render: (args) =>
    `<div class="contact-page" style="max-width: 32rem">${snippet('ui-contact-quick-answer', { stylesheets: ['section-contact-form.css'] })(args)}</div>`,
  args: {
    question: 'Where is my order?',
    answer:
      'Sign in to view your order history and tracking. If tracking has stalled, include your order number in your message so we can check with the carrier.',
  },
};

export const Default = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: 'Where is my order?', level: 3 })).toBeVisible();
  },
};
