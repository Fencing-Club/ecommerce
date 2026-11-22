import { expect, waitFor, within } from 'storybook/test';
import { collectionFilters, collectionPage } from '../fixtures.js';
import { snippet } from '../liquid.js';

/**
 * `snippets/collection-toolbar.liquid`: the bar over a collection's grid. Hide filters, the protection level chips
 * with Shopify's counts and what the levels mean, then the count, sorting and products per row. The chips come from
 * `snippets/collection-protection-filter.liquid` and the help from `snippets/collection-levels-help.liquid`.
 */
export default {
  title: 'Components/Collection toolbar',
  // The filter toggle controls the page's filter panel, which the empty element stands in for.
  render: (args) => `${snippet('collection-toolbar', { stylesheets: ['section-main-collection.css'] })(args)}<div id="StoryFilters"></div>`,
  args: {
    results: collectionPage({ filters: [collectionFilters.protection(), collectionFilters.fie()], count: 137 }),
    section_id: 'story',
    filters_id: 'StoryFilters',
    enable_sorting: true,
    sort_label: 'Sort:',
    guide_url: '#BuyingGuide',
  },
};

export const Default = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Hide filters' })).toHaveAttribute('aria-expanded', 'true');
    const levels = canvas.getByRole('group', { name: 'Protection' });
    // Each rating with products, then FIE; a rating with none drops out.
    await expect(within(levels).getByRole('checkbox', { name: /350N/ })).not.toBeChecked();
    await expect(within(levels).getByRole('checkbox', { name: /FIE/ })).toHaveAttribute('data-filter-url', '#add-fie_status-fie');
    await expect(within(levels).queryByRole('checkbox', { name: /1600N/ })).toBeNull();
    await expect(within(levels).queryByRole('checkbox', { name: /Non-FIE/ })).toBeNull();
    await expect(canvas.getByRole('status')).toHaveTextContent('137 products');
    await expect(canvas.getByRole('button', { name: '4 per row' })).toHaveAttribute('aria-pressed', 'true');
  },
};

export const LevelPicked = {
  args: { results: collectionPage({ filters: [collectionFilters.protection(['800N']), collectionFilters.fie(['FIE'])], count: 38 }) },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('checkbox', { name: /800N/ })).toBeChecked();
    await expect(canvas.getByRole('checkbox', { name: /^FIE/ })).toBeChecked();
    await expect(canvas.getByRole('checkbox', { name: /800N/ })).toHaveAttribute('data-filter-url', '#remove-protection_rating-800n');
  },
};

export const WhatTheLevelsMean = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'What the levels mean' }));
    const help = await waitFor(() => canvas.getByRole('dialog', { name: 'Protection levels' }));
    await expect(help).toBeVisible();
    await expect(within(help).getByText('Mask bibs for FIE events.')).toBeVisible();
    await expect(within(help).getByRole('link', { name: 'Read the buying guide' })).toHaveAttribute('href', '#BuyingGuide');
    await userEvent.click(within(help).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(help).not.toBeVisible());
  },
};

export const NoLevels = {
  args: { results: collectionPage({ filters: [], count: 12 }), filters_id: '' },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('group', { name: 'Protection' })).toBeNull();
    await expect(canvas.queryByRole('button', { name: 'Hide filters' })).toBeNull();
    await expect(canvas.getByRole('status')).toHaveTextContent('12 products');
  },
};
