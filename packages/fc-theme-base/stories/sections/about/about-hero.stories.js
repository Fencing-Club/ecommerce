import { expect, within } from 'storybook/test';
import { image, phaseHeading } from '../../fixtures.js';
import { section } from '../../liquid.js';

const button = (id, label, link, style) => ({ id, type: 'button', settings: { label, link, style, size: 'lg' } });
const chapter = (id, call, topic, link) => ({ id, type: '_bout-link', settings: { call, topic, link } });

/**
 * `sections/about-hero.liquid`: the About page's opening chapter, on a full-bleed photo. Breadcrumbs sit at the top;
 * the eyebrow call, the copy blocks and the row of chapter links (a static `_bout-nav` of `_bout-link` blocks) sit at
 * the bottom.
 */
export default {
  title: 'Sections/About/Hero',
  parameters: { layout: 'fullscreen' },
  args: { image: image('collection-fie-800n-jacket.jpg', 'A fencer lunging in a white jacket') },
  render: section('about-hero', {
    variables: { page: { title: 'About us' } },
    staticBlocks: [
      phaseHeading('On guard', 'En garde', 'p', 'eyebrow'),
      {
        id: 'nav',
        type: '_bout-nav',
        blocks: [
          chapter('en-garde', 'En garde', 'Who we are', '#our-story'),
          chapter('prets', 'Prêts', 'What we stand for', '#what-we-stand-for'),
          chapter('allez', 'Allez', 'How far we’ve come', '#how-far-weve-come'),
          chapter('touche', 'Touché', 'The numbers', '#the-numbers'),
          chapter('la-belle', 'La belle', 'Work with us', '#work-with-us'),
        ],
      },
    ],
    blocks: [
      { id: 'heading', type: 'heading', settings: { heading: 'Fencers equipping fencers.', tag: 'h1', size: 'xl' } },
      { id: 'mission', type: 'text', settings: { text: '<p>We’re a team of fencers in Woodinville, Washington.</p>', style: 'lead' } },
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
    await expect(canvas.getByRole('heading', { level: 1, name: 'Fencers equipping fencers.' })).toBeVisible();
    await expect(canvas.getByRole('img', { name: 'A fencer lunging in a white jacket' })).toBeInTheDocument();
    await expect(within(canvas.getByRole('navigation', { name: 'Breadcrumb' })).getByText('About us')).toHaveAttribute('aria-current', 'page');
    await expect(canvas.getByRole('link', { name: 'Shop all gear' })).toHaveAttribute('href', '/collections/all');
    await expect(canvas.getByRole('link', { name: 'Read our story' })).toHaveAttribute('href', '#our-story');
  },
};

export const ChapterLinks = {
  play: async ({ canvas }) => {
    const chapters = within(canvas.getByRole('navigation', { name: 'Chapters' })).getAllByRole('link');
    await expect(chapters.map((link) => link.textContent.replace(/\s+/g, ' ').trim())).toEqual([
      'En garde Who we are',
      'Prêts What we stand for',
      'Allez How far we’ve come',
      'Touché The numbers',
      'La belle Work with us',
    ]);
    await expect(chapters.map((link) => link.getAttribute('href'))).toEqual(['#our-story', '#what-we-stand-for', '#how-far-weve-come', '#the-numbers', '#work-with-us']);
  },
};

/** Without a photo the hero stays on its dark fill. */
export const NoPhoto = {
  args: { image: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Fencers equipping fencers.' })).toBeVisible();
    await expect(canvas.queryByRole('img')).toBeNull();
  },
};
