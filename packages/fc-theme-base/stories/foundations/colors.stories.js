import { expect } from 'storybook/test';

// The tokens assets/base.css defines (docs/design-tokens.md). Each swatch paints with the live variable, so a change
// to base.css shows here.
const groups = [
  ['Surfaces', ['background', 'card', 'popover', 'muted', 'accent', 'secondary']],
  ['Text', ['foreground', 'muted-foreground', 'primary-foreground', 'accent-foreground']],
  ['Actions and states', ['primary', 'destructive', 'ring']],
  ['Lines', ['border', 'input']],
];

const swatch = (name) => `
  <li class="token-swatch">
    <span class="token-swatch__chip" style="background: var(--${name})"></span>
    <code>--${name}</code>
  </li>`;

/** The color tokens, named after shadcn/ui's with Fencing Club's values. */
export default {
  title: 'Foundations/Colors',
  render: () => `
    <style>
      .token-groups { display: grid; gap: 3.2rem; color: var(--foreground); }
      .token-groups h3 { margin: 0 0 1.2rem; font-size: 1.6rem; }
      .token-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); gap: 1.6rem; margin: 0; padding: 0; list-style: none; }
      .token-swatch { display: grid; gap: 0.8rem; font-size: 1.3rem; }
      .token-swatch__chip { height: 6.4rem; border: 1px solid var(--border); border-radius: var(--radius-md); }
    </style>
    <div class="token-groups">${groups
      .map(([title, names]) => `<section><h3>${title}</h3><ul class="token-list">${names.map(swatch).join('')}</ul></section>`)
      .join('')}</div>`,
};

export const Colors = {
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('listitem')).toHaveLength(groups.flatMap(([, names]) => names).length);
    await expect(canvas.getByText('--destructive')).toBeVisible();
  },
};
