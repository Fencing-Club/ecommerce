import { expect } from 'storybook/test';
import { image } from '../../fixtures.js';
import { section } from '../../liquid.js';

const feature = (id, icon, label, detail, link_label) => ({ id, type: 'feature', settings: { icon, label, detail, link_label, link: `#${id}` } });

/** `sections/why-us.liquid`: a photo beside the shop's case. The photo is a static image block; the rest are theme blocks. */
export default {
  title: 'Sections/Home/Why us',
  parameters: { layout: 'fullscreen' },
  render: section('why-us', {
    staticBlocks: [{ id: 'image', type: 'image', settings: { image: image('collection-fie-800n-jacket.jpg', 'Fencers training'), aspect_ratio: 'landscape' } }],
    blocks: [
      { id: 'eyebrow', type: 'text', settings: { text: '<p>Why Fencing Club</p>', style: 'eyebrow' } },
      { id: 'heading', type: 'heading', settings: { heading: 'Trusted by competitive fencers', size: 'lg' } },
      { id: 'body', type: 'text', settings: { text: '<p>Competition-grade equipment, tested by fencers and trusted by clubs.</p>', style: 'subtle' } },
      {
        id: 'features',
        type: 'group',
        settings: { direction: 'row', gap: 'md', align: 'start' },
        blocks: [
          feature('advice', 'badge-check', 'Expert advice', 'Guidance from national-level fencers', 'Get advice'),
          feature('shipping', 'truck', 'Fast shipping', 'Ships in 1 business day', 'Shipping policy'),
          feature('returns', 'rotate-ccw', 'Easy returns', '30 days, postage paid', 'Returns policy'),
        ],
      },
    ],
  }),
};

export const Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('img', { name: 'Fencers training' })).toBeVisible();
    await expect(canvas.getByRole('heading', { level: 2, name: 'Trusted by competitive fencers' })).toBeVisible();
    await expect(canvas.getByText('Ships in 1 business day')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Returns policy' })).toHaveAttribute('href', '#returns');
  },
};
