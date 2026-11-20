import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

/**
 * `snippets/ui-newsletter-signup.liquid`: an email field and subscribe button that add the address to the store's
 * customers, with the error or thanks after it's sent. The band around it sets its colours; here it's on the page.
 */
export default {
  title: 'Components/Newsletter signup',
  render: snippet('ui-newsletter-signup'),
  args: { id: 'StorySignup', label: 'Enter your email', disclaimer: 'We respect your privacy. Unsubscribe anytime.' },
};

export const Default = {
  play: async ({ canvas, userEvent }) => {
    const field = canvas.getByRole('textbox', { name: 'Enter your email' });
    await expect(field).toBeRequired();
    await expect(field).toHaveAttribute('type', 'email');
    await userEvent.type(field, 'sam@example.com');
    await expect(field).toHaveValue('sam@example.com');
    await expect(canvas.getByRole('button', { name: 'Subscribe' })).toHaveAttribute('type', 'submit');
    await expect(canvas.getByText('We respect your privacy. Unsubscribe anytime.')).toBeVisible();
  },
};

export const Invalid = {
  args: {
    form_state: {
      email: 'sam@',
      errors: { translated_fields: { email: 'email' }, messages: { email: 'is invalid' } },
    },
  },
  play: async ({ canvas }) => {
    const field = canvas.getByRole('textbox', { name: 'Enter your email' });
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toHaveAccessibleDescription('Email is invalid');
    await expect(canvas.getByRole('alert')).toHaveTextContent('Email is invalid');
  },
};

export const Subscribed = {
  args: { form_state: { 'posted_successfully?': true } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Thanks for subscribing');
    await expect(canvas.getByRole('textbox', { name: 'Enter your email' })).toHaveAccessibleDescription('Thanks for subscribing');
  },
};
