import { expect } from 'storybook/test';

// Tailwind's steps on the 4px --spacing unit. Each bar is sized with the live variable.
const steps = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 24];

/**
 * Spacing: Tailwind's 4px unit, for gaps, padding and margins. The theme has no utility classes, so CSS writes the
 * step as `calc(var(--spacing) * n)`, the value Tailwind's `p-n`, `gap-n` and `m-n` classes use.
 */
export default {
  title: 'Foundations/Spacing',
  render: () => `
    <style>
      .space-table { width: 100%; border-collapse: collapse; color: var(--foreground); font-size: var(--text-sm); }
      .space-table th { padding: calc(var(--spacing) * 2) calc(var(--spacing) * 3); border-bottom: 1px solid var(--border); color: var(--muted-foreground); font-weight: var(--font-weight-medium); text-align: start; }
      .space-table td { padding: calc(var(--spacing) * 2) calc(var(--spacing) * 3); border-bottom: 1px solid var(--border); vertical-align: middle; }
      .space-table code { white-space: nowrap; }
      .space-table__bar { display: block; height: 1.6rem; border-radius: var(--radius-sm); background: var(--foreground); }
    </style>
    <table class="space-table">
      <thead><tr><th scope="col">Step</th><th scope="col">CSS</th><th scope="col">Tailwind class</th><th scope="col">Size</th><th scope="col"><span class="visually-hidden">Preview</span></th></tr></thead>
      <tbody>${steps
        .map(
          (n) =>
            `<tr><td>${n}</td><td><code>calc(var(--spacing) * ${n})</code></td><td><code>p-${n}</code>, <code>gap-${n}</code></td><td>${n * 4}px</td><td style="width: 40%"><span class="space-table__bar" style="width: calc(var(--spacing) * ${n})"></span></td></tr>`,
        )
        .join('')}</tbody>
    </table>`,
};

export const Spacing = {
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('row')).toHaveLength(steps.length + 1);
    await expect(canvas.getByText('calc(var(--spacing) * 4)')).toBeVisible();
  },
};
