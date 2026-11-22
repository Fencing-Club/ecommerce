import { expect } from 'storybook/test';
import { image, phaseHeading } from '../../fixtures.js';
import { section } from '../../liquid.js';

const button = (id, label, link, style) => ({ id, type: 'button', settings: { label, link, style, size: 'lg' } });

/**
 * `sections/about-hero.liquid`: the About page's opening chapter. Its phase heading and photo are static blocks; the
 * copy beside the photo is theme blocks.
 */
export default {
  title: 'Sections/About/Hero',
  parameters: { layout: 'fullscreen' },
  render: section('about-hero', {
    staticBlocks: [
      phaseHeading('Phase 00', 'Take your stance', 'En garde', 'p'),
      { id: 'image', type: 'image', settings: { image: image('collection-fie-800n-jacket.jpg', 'A fencing jacket'), aspect_ratio: 'landscape' } },
    ],
    blocks: [
      { id: 'heading', type: 'heading', settings: { heading: 'Everything for fencing, and only fencing.', tag: 'h1', size: 'xl' } },
      { id: 'mission', type: 'text', settings: { text: '<p>A specialty shop serving clubs, schools and individual athletes since 2023.</p>', style: 'lead' } },
      {
        id: 'actions',
        type: 'group',
        settings: { direction: 'row', gap: 'sm', align: 'center' },
        blocks: [button('shop', 'Shop all gear', '/collections/all', 'primary'), button('story', 'Read our story', '#our-story', 'outline')],
      },
    ],
  }),
};

export const Hero = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Everything for fencing, and only fencing.' })).toBeVisible();
    await expect(canvas.getByText('En garde')).toBeVisible();
    await expect(canvas.getByRole('img', { name: 'A fencing jacket' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Shop all gear' })).toHaveAttribute('href', '/collections/all');
    await expect(canvas.getByRole('link', { name: 'Read our story' })).toHaveAttribute('href', '#our-story');
  },
};
