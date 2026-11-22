import { expect, waitFor } from 'storybook/test';
import { articles, products } from '../fixtures.js';
import { loadScript, renderLiquid, settings, snippet } from '../liquid.js';

const suggestUrl = '/story/search/suggest';
const category = (title, count) => ({ title, url: `#${title.toLowerCase()}`, object: { products_count: count } });
// Theme settings name the Popular categories menu; linklists holds its links.
const searchGlobals = {
  settings: { ...settings, predictive_search_enabled: true, predictive_search_show_price: true, popular_categories_menu: 'popular-categories' },
  linklists: { 'popular-categories': { links: [category('Masks', 12), category('Jackets', 18), category('Weapons', 24)] } },
  routes: { root_url: '/', search_url: '/search' },
};

// What Shopify's predictive search returns for a query, rendered by the theme's predictive-search section.
const results = (terms) => {
  const found = terms.toLowerCase().startsWith('fenc');
  const resources = found
    ? {
        queries: [{ text: 'fencing socks', styled_text: '<mark>fenc</mark>ing socks', url: '#fencing-socks' }],
        collections: [{ title: 'Footwear', products_count: 6, url: '#footwear' }],
        products,
        articles: [articles[0]],
        pages: [],
      }
    : { queries: [], collections: [], products: [], articles: [], pages: [] };
  const section = renderLiquid('predictive-search', { predictive_search: { performed: true, terms, resources } }, searchGlobals);
  return `<div id="shopify-section-predictive-search">${section}</div>`;
};

// Answers the theme's suggest requests in the browser. `searchDelay` holds a response back to show the loading state.
const searchApi = ({ parameters }) => {
  window.routes = { ...window.routes, search_url: '/search', predictive_search_url: suggestUrl };
  window.storySearchDelay = parameters.searchDelay ?? 0;
  try {
    localStorage.removeItem('fc:recent-searches');
  } catch {
    // Recent searches are optional; without storage the idle panel shows only categories.
  }
  if (!window.storySearchFetch) {
    const original = window.fetch.bind(window);
    window.storySearchFetch = true;
    window.fetch = (input, init) => {
      const url = new URL(String(input), window.location.href);
      if (url.pathname !== suggestUrl) return original(input, init);
      return new Promise((resolve) => {
        setTimeout(() => resolve(new Response(results(url.searchParams.get('q') || ''))), window.storySearchDelay);
      });
    };
  }
};

const loadSearch = async () => {
  await loadScript('search-form.js')();
  await loadScript('predictive-search.js')();
};

/**
 * `snippets/ui-search-form.liquid` with predictive search: popular categories before typing, then suggestions,
 * categories, products and guides from `sections/predictive-search.liquid`.
 */
export default {
  title: 'Components/Predictive search',
  loaders: [searchApi, loadSearch],
  render: (args) =>
    `<div style="max-width: 72rem; min-height: 64rem">${snippet('ui-search-form', {
      stylesheets: ['component-predictive-search.css', 'section-main-search.css'],
      globals: searchGlobals,
    })(args)}</div>`,
  args: { input_id: 'StorySearch', label: 'Search products, guides and help', button_label: 'Search' },
};

const field = (canvas) => canvas.getByRole('combobox', { name: 'Search products, guides and help' });

export const Idle = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(field(canvas));
    await waitFor(() => expect(canvas.getByRole('link', { name: /Masks/ })).toBeVisible());
    await expect(canvas.getByRole('link', { name: /Jackets/ })).toBeVisible();
  },
};

export const Results = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(field(canvas), 'fenc');
    await waitFor(() => expect(canvas.getByRole('link', { name: /fencing socks/ })).toBeVisible());
    await expect(canvas.getByRole('link', { name: /Footwear/ })).toBeVisible();
    await expect(canvas.getByText('Competition jacket')).toBeVisible();
    await expect(canvas.getByRole('link', { name: /Choosing your first fencing kit/ })).toBeVisible();
  },
};

export const NoResults = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(field(canvas), 'zzz');
    await waitFor(() => expect(canvas.getByText('No results for “zzz”')).toBeVisible());
    await expect(canvas.getByRole('link', { name: /Masks/ })).toBeVisible();
  },
};

export const Loading = {
  parameters: { searchDelay: 60000 },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(field(canvas), 'fenc');
    await waitFor(() => expect(canvasElement.querySelector('predictive-search')).toHaveAttribute('loading'));
    await expect(canvasElement.querySelector('.predictive-search__skeleton')).toBeVisible();
  },
};
