import { expect, waitFor } from 'storybook/test';
import { image } from '../../fixtures.js';
import { loadScript, loadStylesheet, section } from '../../liquid.js';

const slide = (id, file, heading, tag) => ({
  id,
  type: '_hero-slide',
  settings: { image: image(file, `${heading} photo`) },
  blocks: [
    { id: `${id}-eyebrow`, type: 'text', settings: { text: '<p>Olympic fencing gear</p>', style: 'eyebrow' } },
    { id: `${id}-heading`, type: 'heading', settings: { heading, tag, size: 'xl' } },
    { id: `${id}-text`, type: 'text', settings: { text: '<p>Gear at competitive prices for competitive athletes.</p>' } },
    {
      id: `${id}-actions`,
      type: 'group',
      settings: { direction: 'row', gap: 'lg', align: 'center' },
      blocks: [
        { id: `${id}-button`, type: 'button', settings: { label: 'Shop now', link: '#shop', style: 'secondary', size: 'lg' } },
        { id: `${id}-link`, type: 'link', settings: { label: 'Starter kits', link: '#kits' } },
      ],
    },
  ],
});

const slides = [
  slide('slide-1', 'collection-fie-800n-jacket.jpg', 'Shop', 'h1'),
  slide('slide-2', 'collection-aero-competition-jacket.jpg', 'Meet Novus', 'h2'),
];

/** `sections/home-hero.liquid`: full-bleed slides that fade one to the next. Each slide is a `_hero-slide` block. */
export default {
  title: 'Sections/Home/Hero',
  args: { autoplay: false },
  loaders: [loadStylesheet('section-home.css'), loadScript('fc-carousel.js')],
  parameters: { layout: 'fullscreen' },
};

export const Slides = {
  render: section('home-hero', { blocks: slides }),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Shop' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Shop now' })).toHaveAttribute('href', '#shop');
    await userEvent.click(canvas.getByRole('button', { name: 'Next slide' }));
    await waitFor(() => expect(canvas.getByRole('tab', { name: 'Slide 2' })).toHaveAttribute('aria-selected', 'true'));
    await waitFor(() => expect(canvas.getByRole('group', { name: '2 of 2' })).toBeVisible());
  },
};

export const OneSlide = {
  render: section('home-hero', { blocks: slides.slice(0, 1) }),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Shop' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Next slide' })).toBeNull();
  },
};
