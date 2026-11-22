import { expect } from 'storybook/test';
import { block } from '../liquid.js';

/** `blocks/feature.liquid`: a short selling point with an icon, a line of detail and an optional link. */
export default {
  title: 'Blocks/Feature',
  render: block('feature'),
  args: { icon: 'truck', label: 'Fast shipping', detail: 'Ships in 1 business day' },
  argTypes: { icon: { control: 'inline-radio', options: ['badge-check', 'truck', 'rotate-ccw', 'star', 'target', 'tag', 'git-branch', 'life-buoy'] } },
};

export const Plain = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Fast shipping')).toBeVisible();
    await expect(canvas.getByText('Ships in 1 business day')).toBeVisible();
    await expect(canvas.queryByRole('link')).toBeNull();
  },
};

export const WithLink = {
  args: { link_label: 'Shipping policy', link: '#shipping' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Shipping policy' })).toHaveAttribute('href', '#shipping');
  },
};
