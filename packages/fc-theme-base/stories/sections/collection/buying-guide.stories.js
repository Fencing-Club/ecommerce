import { expect, within } from 'storybook/test';
import { collectionPage } from '../../fixtures.js';
import { loadScript, section } from '../../liquid.js';

const level = (label, meaning, where, link = '') => ({ id: `level-${label}`, type: 'level', settings: { label, meaning, where, link } });
const question = (id, text, answer) => ({ id, type: 'question', settings: { question: text, answer: `<p>${answer}</p>` } });

/**
 * `sections/collection-buying-guide.liquid`: below the grid, so products load first. What each protection level
 * means with a link to it, questions marked up as an FAQPage, popular filtered pages and the brands in the
 * collection. A level's link defaults to the collection filtered by it.
 */
export default {
  title: 'Sections/Collection/Buying guide',
  parameters: { layout: 'fullscreen' },
  loaders: [loadScript('motion.js')],
  render: section('collection-buying-guide', {
    sectionBlocks: [
      level('350N', 'Fabric resists 350 newtons.', 'Club training and most domestic events.'),
      level('800N FIE', '800N fabric, approved by the FIE.', 'FIE events, and any event that asks for FIE clothing.'),
      level('1600N FIE', 'Mask bibs that resist 1,600 newtons, approved by the FIE.', 'Masks for FIE events.', '/collections/masks'),
      question('size', 'What size fencing jacket should I buy?', 'Measure your chest, waist and arm length, then match them to the size chart.'),
      question('clubs', 'Do clubs get special pricing?', 'Yes. Clubs, schools and nonprofits get member pricing and bulk discounts.'),
    ],
    variables: { collection: collectionPage({ title: 'Fencing clothing' }) },
    globals: {
      linklists: { popular: { links: [{ title: "Women's fencing jackets", url: '#womens' }, { title: '800N FIE jackets', url: '#800n-fie' }] } },
    },
  }),
  args: { popular_menu: 'popular' },
};

export const Default = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'How to choose fencing clothing' })).toBeVisible();
    const table = canvas.getByRole('table');
    await expect(within(table).getByRole('columnheader', { name: "Where you'll wear it" })).toBeVisible();
    await expect(within(table).getByRole('link', { name: 'Shop 350N' })).toHaveAttribute('href', '/collections/clothing?filter.p.m.custom.protection_rating=350N');
    await expect(within(table).getByRole('link', { name: 'Shop 800N FIE' })).toHaveAttribute(
      'href',
      '/collections/clothing?filter.p.m.custom.protection_rating=800N&filter.p.m.custom.fie_status=FIE',
    );
    await expect(within(table).getByRole('link', { name: 'Shop 1600N FIE' })).toHaveAttribute('href', '/collections/masks');
    await expect(canvas.getByRole('heading', { level: 2, name: 'Questions about fencing clothing' })).toBeVisible();
    await expect(canvas.getByText(/Measure your chest/)).toBeVisible();
    await expect(canvas.getByRole('navigation', { name: 'Popular in fencing clothing' })).toBeVisible();
    await expect(canvas.getByRole('img', { name: 'FWF' })).toBeVisible();
    await expect(canvas.queryByRole('img', { name: 'Fencing Club' })).toBeNull();
  },
};

export const LevelsOnly = {
  render: section('collection-buying-guide', {
    sectionBlocks: [level('FIE', 'Approved by the FIE, with no newton rating.', 'Gloves and chest protectors for FIE events.')],
    variables: { collection: { ...collectionPage(), all_vendors: [] } },
  }),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Shop FIE' })).toHaveAttribute('href', '/collections/clothing?filter.p.m.custom.fie_status=FIE');
    await expect(canvas.queryByRole('heading', { name: /Questions about/ })).toBeNull();
  },
};
