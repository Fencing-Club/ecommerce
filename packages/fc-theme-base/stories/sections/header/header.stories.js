import { expect, within } from 'storybook/test';
import navigation from '../../../content/navigation-source.json';
import { assetUrl, section, settings } from '../../liquid.js';

const menuLink = (item) => ({
  title: item.title,
  handle: item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  url: item.url,
  links: (item.items ?? []).map(menuLink),
});

const utilityLink = (id, label, link) => ({ id, type: '_utility-link', settings: { label, link } });

const blocks = [
  utilityLink('home', 'Home', '/'),
  utilityLink('about', 'About us', '/pages/about-us'),
  utilityLink('contact', 'Contact', '/pages/contact'),
  utilityLink('order-tracking', 'Order tracking', '/account/orders'),
  utilityLink('returns', 'Returns', '/pages/refund-policy'),
];

const variables = {
  settings: { ...settings, logo: null },
  request: { page_type: 'collection' },
  cart: { item_count: 2 },
  pages: {},
};

/**
 * `sections/header.liquid`: the utility row's links are `_utility-link` blocks beside the language and currency
 * selectors, over the logo, the main menu and the search, account and cart icons.
 */
export default {
  title: 'Sections/Header/Header',
  parameters: { layout: 'fullscreen' },
  args: { menu: { links: navigation.menus[0].items.map(menuLink) } },
  // The layout loads the localization and search styles. The header loads its menu, search, drawer and cart styles
  // with a print-media swap on load, which never fires for markup a story inserts.
  render: (args) =>
    [
      'component-localization-form.css',
      'component-predictive-search.css',
      'component-list-menu.css',
      'component-search.css',
      'component-menu-drawer.css',
      'component-cart-notification.css',
      'component-mega-menu.css',
    ]
      .map((file) => `<link rel="stylesheet" href="${assetUrl(file)}">`)
      .join('') + section('header', { blocks, variables })(args),
};

export const Default = {
  play: async ({ canvas }) => {
    const utility = canvas.getByRole('navigation', { name: 'Store information' });
    await expect(within(utility).getAllByRole('link').map((link) => link.textContent.trim())).toEqual([
      'Home',
      'About us',
      'Contact',
      'Order tracking',
      'Returns',
    ]);
    await expect(within(utility).getByRole('link', { name: 'Returns' })).toHaveAttribute('href', '/pages/refund-policy');
    await expect(canvas.getAllByRole('button', { name: /United States \(USD \$\)/ }).length).toBeGreaterThan(0);
    await expect(canvas.getByRole('link', { name: /Cart/ })).toHaveAttribute('href', '/cart');
  },
};

/** With both selectors switched off, neither the utility row nor the menu offers a language or currency. */
export const WithoutSelectors = {
  args: { enable_language_selector: false, enable_country_selector: false },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button', { name: /United States/ })).toBeNull();
    await expect(canvas.queryByRole('button', { name: /English/ })).toBeNull();
  },
};
