import { expect } from 'storybook/test';

// Tailwind's steps on the 4px --spacing unit. Each bar is sized with the live variable.
const steps = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 24];

/** Spacing: `calc(var(--spacing) * n)`, Tailwind's 4px unit, for gaps, padding and margins. */
export default {
  title: 'Foundations/Spacing',
  render: () => `
    <style>
      .space-list { display: grid; gap: 1.2rem; margin: 0; padding: 0; list-style: none; color: var(--foreground); font-size: var(--text-sm); }
      .space-list li { display: grid; grid-template-columns: 6rem 8rem 1fr; align-items: center; gap: 1.6rem; }
      .space-list span:last-child { height: 1.6rem; border-radius: var(--radius-sm); background: var(--foreground); }
      .space-list code { color: var(--muted-foreground); }
    </style>
    <ul class="space-list">${steps
      .map((n) => `<li><strong>${n}</strong><code>${n * 4}px</code><span style="width: calc(var(--spacing) * ${n})"></span></li>`)
      .join('')}</ul>`,
};

export const Spacing = {
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('listitem')).toHaveLength(steps.length);
  },
};
