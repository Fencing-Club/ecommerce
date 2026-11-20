import { expect } from 'storybook/test';
import { block } from '../liquid.js';

/** `blocks/email-signup.liquid`: an email signup form any section can hold. It takes the section's colours. */
export default {
  title: 'Blocks/Email signup',
  render: block('email-signup'),
};

export const Default = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox', { name: 'Enter your email' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Subscribe' })).toBeVisible();
    await expect(canvas.getByText('We respect your privacy. Unsubscribe anytime.')).toBeVisible();
  },
};

export const NoPrivacyText = {
  args: { button_label: 'Notify me', disclaimer: '' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Notify me' })).toBeVisible();
    await expect(canvas.queryByText('We respect your privacy. Unsubscribe anytime.')).toBeNull();
  },
};
