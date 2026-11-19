import { themeCss } from '../stories/liquid.js';

// The store's `html` has the `js` class once scripts run, and its layout writes the theme's CSS variables first.
document.documentElement.classList.add('js');
const tokens = document.createElement('style');
tokens.textContent = `${themeCss()}
html { box-sizing: border-box; font-size: calc(var(--font-body-scale) * 62.5%); }
*, *::before, *::after { box-sizing: inherit; }
body {
  margin: 0;
  color: rgba(var(--color-foreground), 0.75);
  background-color: rgb(var(--color-background));
  font-size: 1.6rem;
  letter-spacing: 0.06rem;
  line-height: calc(1 + 0.8 / var(--font-body-scale));
  font-family: var(--font-body-family);
}`;
document.head.prepend(tokens);

/** @type {import('@storybook/html-vite').Preview} */
export default {
  parameters: {
    layout: 'padded',
    a11y: { test: 'error' },
  },
};
