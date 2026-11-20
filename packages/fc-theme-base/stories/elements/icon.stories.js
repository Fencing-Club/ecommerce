import { expect } from 'storybook/test';
import { renderLiquid } from '../liquid.js';
import fcIconSource from '../../snippets/fc-icon.liquid?raw';
import uiIconSource from '../../snippets/ui-icon.liquid?raw';

// Every icon each snippet draws, read from the snippet itself so a new icon shows up here.
const names = (source) => [...source.matchAll(/when '([^']+)'/g)].map(([, name]) => name);

const grid = (snippetName, icons, size) => `
  <style>
    .icon-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: 1.6rem; margin: 0; padding: 0; list-style: none; color: var(--foreground); }
    .icon-grid li { display: grid; justify-items: center; gap: 0.8rem; padding: 1.6rem 0.8rem; border: 1px solid var(--border); border-radius: var(--radius-md); font-size: 1.2rem; }
    .icon-grid .ui-icon { width: 2rem; height: 2rem; }
  </style>
  <ul class="icon-grid">${icons
    .map((icon) => `<li>${renderLiquid(snippetName, { icon, size })}<code>${icon}</code></li>`)
    .join('')}</ul>`;

/**
 * `snippets/fc-icon.liquid` draws the Lucide icons most components use; `snippets/ui-icon.liquid` draws the few the
 * older ui components use.
 */
export default { title: 'Elements/Icon' };

export const Lucide = {
  render: () => grid('fc-icon', names(fcIconSource), 20),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('svg.fc-icon')).toHaveLength(names(fcIconSource).length);
  },
};

export const UiIcon = {
  name: 'ui-icon',
  render: () => grid('ui-icon', names(uiIconSource)),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('svg.ui-icon')).toHaveLength(names(uiIconSource).length);
  },
};
