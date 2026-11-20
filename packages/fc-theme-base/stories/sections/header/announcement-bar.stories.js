import { expect, waitFor } from 'storybook/test';
import { loadScript, section } from '../../liquid.js';

const announcement = (id, title, message, tone, link_label) => ({
  id,
  type: '_announcement',
  settings: { title, message, tone, link: `#${id}`, link_label },
});

const announcements = [
  announcement('shipping', 'Free US shipping', 'On orders over $375', 'default', 'Shop now'),
  announcement('sale', 'New athletic season', 'Up to 30% off', 'sale', 'Shop the sale'),
  announcement('event', 'Summer nationals', 'Visit us at booth 14', 'event', 'Event details'),
];

/**
 * `sections/announcement-bar.liquid`: the strip above the header. Each announcement is an `_announcement` block on
 * `ui-banner`, and the bar fades between them.
 */
export default {
  title: 'Sections/Header/Announcement bar',
  args: { autoplay: false },
  loaders: [loadScript('fc-carousel.js')],
  parameters: { layout: 'fullscreen' },
};

export const Announcements = {
  render: section('announcement-bar', { blocks: announcements }),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('region', { name: 'Announcements' })).toBeVisible();
    await waitFor(() => expect(canvas.getByRole('group', { name: '1 of 3' })).toBeVisible());
    await expect(canvas.getByRole('link', { name: 'Shop now' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Next announcement' }));
    await waitFor(() => expect(canvas.getByRole('link', { name: 'Shop the sale' })).toBeVisible());
    await userEvent.click(canvas.getByRole('button', { name: 'Previous announcement' }));
    await waitFor(() => expect(canvas.getByRole('link', { name: 'Shop now' })).toBeVisible());
  },
};

export const OneAnnouncement = {
  render: section('announcement-bar', { blocks: announcements.slice(0, 1) }),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Shop now' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Next announcement' })).toBeNull();
  },
};
