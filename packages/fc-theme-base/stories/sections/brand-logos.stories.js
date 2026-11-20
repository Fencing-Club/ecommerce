import { expect } from 'storybook/test';
import { brandLogos, sectionHeader } from '../fixtures.js';
import { section } from '../liquid.js';

/** `sections/brand-logos.liquid`: the brands the shop carries. Each logo is a `_logo` block. */
export default {
  title: 'Sections/Brand logos',
  parameters: { layout: 'fullscreen' },
  render: section('brand-logos', {
    staticBlocks: [sectionHeader('Authorized seller', "Official dealer for the sport's best brands")],
    blocks: brandLogos.map((logo, i) => ({ id: `logo-${i}`, type: '_logo', settings: { image: logo, link: i === 0 ? '#fwf' : '' } })),
  }),
};

export const Logos = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: "Official dealer for the sport's best brands" })).toBeVisible();
    await expect(canvas.getAllByRole('img')).toHaveLength(4);
    await expect(canvas.getByRole('link', { name: 'FWF' })).toHaveAttribute('href', '#fwf');
  },
};
