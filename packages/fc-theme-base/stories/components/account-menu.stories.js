import { expect, waitFor } from 'storybook/test';
import { loadScript, snippet } from '../liquid.js';

const routes = {
  root_url: '/',
  account_url: '#account',
  account_login_url: '#sign-in',
  account_profile_url: '#profile',
  account_logout_url: '#sign-out',
};

/**
 * `snippets/account-menu.liquid`: the header's account icon and its menu, a popover on wider screens and a bottom sheet
 * on phones.
 */
export default {
  title: 'Components/Account menu',
  loaders: [loadScript('account-menu.js')],
  render: (args) =>
    `<div class="header__icons" style="display: flex; justify-content: flex-end">${snippet('account-menu', {
      stylesheets: ['section-header.css'],
      globals: { routes, customer: args.customer },
    })(args)}</div>`,
  args: { customer: null },
};

const open = async (canvas, userEvent, name) => {
  await userEvent.click(canvas.getByRole('link', { name: 'Account' }));
  await waitFor(() => expect(canvas.getByRole('dialog', { name })).toBeVisible());
  return canvas.getByRole('dialog', { name });
};

export const SignedOut = {
  play: async ({ canvas, userEvent }) => {
    const menu = await open(canvas, userEvent, 'Your account');
    await expect(menu).toHaveTextContent('Sign in to track orders');
    await expect(canvas.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '#sign-in');
    await userEvent.click(canvas.getByRole('button', { name: 'Close account menu' }));
    await waitFor(() => expect(canvas.queryByRole('dialog', { name: 'Your account' })).toBeNull());
    await expect(canvas.getByRole('link', { name: 'Account' })).toHaveFocus();
  },
};

export const SignedIn = {
  args: { customer: { first_name: 'Alex', name: 'Alex Morgan', email: 'alex@example.com' } },
  play: async ({ canvas, userEvent }) => {
    const menu = await open(canvas, userEvent, 'Alex Morgan');
    await expect(menu).toHaveTextContent('alex@example.com');
    await expect(canvas.getByRole('link', { name: 'Orders' })).toHaveAttribute('href', '#account');
    await expect(canvas.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '#profile');
    await expect(canvas.getByRole('link', { name: 'Sign out' })).toHaveAttribute('href', '#sign-out');
    await userEvent.click(canvas.getByRole('button', { name: 'Close account menu' }));
    await waitFor(() => expect(canvas.queryByRole('dialog', { name: 'Alex Morgan' })).toBeNull());
  },
};
