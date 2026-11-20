import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

/** `snippets/ui-banner.liquid`: a full-width strip with one short message. The tone sets its colour. */
export default {
  title: 'Elements/Banner',
  render: snippet('ui-banner'),
  args: { title: 'Free US shipping', message: 'On orders over $375', link_label: 'Shop now', url: '#shop' },
  parameters: { layout: 'fullscreen' },
};

export const Default = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Free US shipping')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Shop now' })).toHaveAttribute('href', '#shop');
  },
};

export const Sale = {
  args: { tone: 'sale', title: 'New athletic season', message: 'Up to 30% off', link_label: 'Shop the sale' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Shop the sale' })).toBeVisible();
  },
};

export const Event = {
  args: { tone: 'event', title: 'Summer nationals', message: 'Visit us at booth 14', link_label: 'Event details' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Visit us at booth 14')).toBeVisible();
  },
};

export const Vacation = {
  args: { tone: 'vacation', title: 'Traveling to our factories', message: 'Orders ship from July 20', link_label: 'Learn more' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Orders ship from July 20')).toBeVisible();
  },
};

export const WithoutLink = {
  args: { link_label: '', url: '' },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('link')).toBeNull();
  },
};
