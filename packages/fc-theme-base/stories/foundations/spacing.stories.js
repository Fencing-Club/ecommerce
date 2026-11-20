import { expect } from 'storybook/test';

// The named steps in assets/base.css. Each bar is sized with the live token.
const steps = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24];
const token = (n) => `--spacing-${String(n).replace('.', '-')}`;

/** Spacing: one token per step on Tailwind's 4px unit, for gaps, padding and margins. */
export default {
  title: 'Foundations/Spacing',
  render: () => `
    <style>
      .space-table { width: 100%; border-collapse: collapse; color: var(--foreground); font-size: var(--text-sm); }
      .space-table th { padding: var(--spacing-2) var(--spacing-3); border-bottom: 1px solid var(--border); color: var(--muted-foreground); font-weight: var(--font-weight-medium); text-align: start; }
      .space-table td { padding: var(--spacing-2) var(--spacing-3); border-bottom: 1px solid var(--border); vertical-align: middle; }
      .space-table__bar { display: block; height: 1.6rem; border-radius: var(--radius-sm); background: var(--foreground); }
    </style>
    <table class="space-table">
      <thead><tr><th scope="col">Token</th><th scope="col">Size</th><th scope="col"><span class="visually-hidden">Preview</span></th></tr></thead>
      <tbody>${steps
        .map(
          (n) =>
            `<tr><td><code>${token(n)}</code></td><td>${n * 4}px</td><td style="width: 60%"><span class="space-table__bar" style="width: var(${token(n)})"></span></td></tr>`,
        )
        .join('')}</tbody>
    </table>`,
};

export const Spacing = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getAllByRole('row')).toHaveLength(steps.length + 1);
    const bar = canvasElement.querySelector('.space-table__bar[style*="--spacing-4)"]');
    await expect(getComputedStyle(bar).width).toBe('16px');
  },
};
