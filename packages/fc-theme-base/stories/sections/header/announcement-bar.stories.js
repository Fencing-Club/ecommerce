import { expect, waitFor } from 'storybook/test';
import { loadScript, section } from '../../liquid.js';

const announcement = (id, title, message, tone, link_label) => ({
  id,
  type: '_announcement',
  settings: { title, message, tone, link: `#${id}`, link_label },
});

// Free shipping takes its minimum from the theme settings, as the cart does.
const freeShipping = { id: 'shipping', type: '_announcement', settings: { content: 'free_shipping', tone: 'default', link: '#shipping', link_label: 'Shop now' } };

const announcements = [
  freeShipping,
  announcement('sale', 'New athletic season', 'Up to 30% off', 'sale', 'Shop the sale'),
  announcement('event', 'Summer nationals', 'Visit us at booth 14', 'event', 'Event details'),
];

// A US shopper paying in dollars, who gets free shipping.
const usStore = { shop: { currency: 'USD' }, cart: { currency: { iso_code: 'USD', symbol: '$' } } };

/**
 * `sections/announcement-bar.liquid`: the strip above the header. Each announcement is an `_announcement` block on
 * `ui-banner`, and the bar fades between them. A free shipping announcement reads its minimum from the theme settings
 * and shows only to shoppers who get free shipping.
 */
export default {
  title: 'Sections/Header/Announcement bar',
  args: { autoplay: false },
  loaders: [loadScript('fc-carousel.js')],
  parameters: { layout: 'fullscreen' },
};

export const Announcements = {
  render: section('announcement-bar', { blocks: announcements, globals: usStore }),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('region', { name: 'Announcements' })).toBeVisible();
    await waitFor(() => expect(canvas.getByRole('group', { name: '1 of 3' })).toBeVisible());
    await expect(canvas.getByText('On orders over $375')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Shop now' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Next announcement' }));
    await waitFor(() => expect(canvas.getByRole('link', { name: 'Shop the sale' })).toBeVisible());
    await userEvent.click(canvas.getByRole('button', { name: 'Previous announcement' }));
    await waitFor(() => expect(canvas.getByRole('link', { name: 'Shop now' })).toBeVisible());
  },
};

export const OutsideTheUs = {
  render: section('announcement-bar', {
    blocks: announcements,
    globals: { ...usStore, localization: { country: { iso_code: 'CA', name: 'Canada', currency: { iso_code: 'CAD', symbol: '$' } } } },
  }),
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole('group', { name: '1 of 2' })).toBeVisible());
    await expect(canvas.queryByText(/Free US shipping/)).toBeNull();
  },
};

export const OneAnnouncement = {
  render: section('announcement-bar', { blocks: announcements.slice(0, 1), globals: usStore }),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Shop now' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Next announcement' })).toBeNull();
  },
};
