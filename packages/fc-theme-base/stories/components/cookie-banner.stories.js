import { expect, waitFor, within } from 'storybook/test';
import { loadScript, snippet } from '../liquid.js';

// A stand-in for Shopify's Customer Privacy API: a new visitor with no choice saved. `consentFails` makes the save fail.
const privacyApi = ({ parameters }) => {
  window.Shopify = window.Shopify || {};
  window.Shopify.customerPrivacy = {
    currentVisitorConsent: () => ({ analytics: '', marketing: '', preferences: '' }),
    shouldShowBanner: () => true,
    setTrackingConsent: (_selection, callback) => {
      setTimeout(() => callback(parameters.consentFails ? { error: 'Save failed' } : {}), 50);
    },
  };
};

/**
 * `snippets/cookie-consent.liquid`: the cookie banner and its preferences dialog. Choices go to Shopify's Customer
 * Privacy API.
 */
export default {
  title: 'Components/Cookie banner',
  loaders: [privacyApi, loadScript('cookie-consent.js')],
  render: snippet('cookie-consent', { stylesheets: ['component-cookie-consent.css'] }),
};

const banner = (canvas) => canvas.getByRole('region', { name: 'Cookie consent' });

export const Banner = {
  play: async ({ canvas, userEvent }) => {
    await waitFor(() => expect(banner(canvas)).toBeVisible());
    await expect(canvas.getByRole('heading', { name: 'You choose how we use cookies' })).toBeVisible();
    await expect(canvas.getAllByRole('link', { name: 'Privacy policy' })[0]).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Cookie consent' })).toBeNull());
  },
};

export const Preferences = {
  play: async ({ canvas, userEvent }) => {
    await waitFor(() => expect(banner(canvas)).toBeVisible());
    await userEvent.click(canvas.getByRole('button', { name: 'Manage preferences' }));
    const dialog = await waitFor(() => canvas.getByRole('dialog', { name: 'Cookie preferences' }));
    await expect(canvas.getByRole('checkbox', { name: /Required/ })).toBeDisabled();
    await expect(canvas.getByRole('checkbox', { name: /Required/ })).toBeChecked();
    await userEvent.click(canvas.getByRole('checkbox', { name: /Marketing/ }));
    await expect(canvas.getByRole('checkbox', { name: /Marketing/ })).toBeChecked();
    await userEvent.click(canvas.getByRole('button', { name: 'Save preferences' }));
    await waitFor(() => expect(dialog).not.toBeVisible());
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Cookie consent' })).toBeNull());
  },
};

export const SaveFailed = {
  parameters: { consentFails: true },
  play: async ({ canvas, userEvent }) => {
    await waitFor(() => expect(banner(canvas)).toBeVisible());
    await userEvent.click(canvas.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(within(banner(canvas)).getByText("We couldn't save your choice. Try again.")).toBeVisible());
    await expect(canvas.getByRole('button', { name: 'Accept' })).toBeEnabled();
  },
};
