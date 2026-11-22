import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

/** `snippets/mega-menu-card.liquid`: a picture card in the mega menu, with a title, View and a short description. */
export default {
  title: 'Components/Mega menu card',
  render: (args) =>
    `<div class="fc-mega" style="max-width: 40rem"><div class="fc-mega__cards">${snippet('mega-menu-card', {
      stylesheets: ['component-mega-menu.css'],
    })(args)}</div></div>`,
  args: { childlink: { title: 'Shoes', handle: 'shoes', url: '#shoes', current: false }, compact: false },
};

export const Default = {
  play: async ({ canvas }) => {
    const card = canvas.getByRole('link', { name: /Shoes/ });
    await expect(card).toHaveAttribute('href', '#shoes');
    await expect(card).toHaveTextContent('Grippy soles and lunge support.');
    await expect(card).not.toHaveAttribute('aria-current');
  },
};

export const Compact = {
  args: { childlink: { title: 'Scoring systems', handle: 'scoring-systems', url: '#scoring', current: false }, compact: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: /Scoring systems/ })).toHaveTextContent('FIE machines and repeaters.');
  },
};

export const Current = {
  args: { childlink: { title: 'Wheel bags', handle: 'wheel-bags', url: '#wheel-bags', current: true } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: /Wheel bags/ })).toHaveAttribute('aria-current', 'page');
  },
};
