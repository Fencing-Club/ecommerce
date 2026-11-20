import { expect } from 'storybook/test';

// Tailwind's type scale. Each sample uses the live size and line-height variables.
const sizes = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'];
const weights = ['normal', 'medium', 'semibold', 'bold'];

const sample = (size, family) =>
  `<li><code>--text-${size}</code><span style="font-family: var(${family}); font-size: var(--text-${size}); line-height: var(--text-${size}--line-height)">Grippy soles and lunge support</span></li>`;

const page = (items) => `
  <style>
    .type-list { display: grid; gap: 1.6rem; margin: 0; padding: 0; list-style: none; color: var(--foreground); }
    .type-list li { display: grid; grid-template-columns: 14rem 1fr; align-items: baseline; gap: 1.6rem; }
    .type-list code { font-size: var(--text-xs); color: var(--muted-foreground); }
  </style>
  <ul class="type-list">${items}</ul>`;

/** Type: Tailwind's size scale and weights, set in the device's own font (`--font-sans`). */
export default { title: 'Foundations/Typography' };

export const Sizes = {
  name: 'Sizes',
  render: () => page(sizes.map((size) => sample(size, '--font-body-family')).join('')),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('listitem')).toHaveLength(sizes.length);
  },
};


export const Weights = {
  render: () =>
    page(
      weights
        .map(
          (weight) =>
            `<li><code>--font-weight-${weight}</code><span style="font-size: var(--text-lg); font-weight: var(--font-weight-${weight})">Add to cart</span></li>`,
        )
        .join(''),
    ),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('listitem')).toHaveLength(weights.length);
  },
};
