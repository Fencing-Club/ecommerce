import { expect } from 'storybook/test';

/**
 * Page layout: every full-width band lines its content up on one gutter. `--gutter` sits beside the content, which
 * stops at `--content-max` and centers; `.page-width` applies it (docs/shopify-page-layout.md). Resize the viewport to
 * see the gutter grow at 990px.
 */
export default {
  title: 'Foundations/Layout',
  parameters: { layout: 'fullscreen' },
  render: () => `
    <style>
      .layout-band { padding-block: 3.2rem; background: var(--muted); }
      .layout-band__content { display: grid; gap: 0.8rem; padding: 2.4rem; border: 1px dashed var(--input); background: var(--background); color: var(--foreground); font-size: var(--text-sm); }
      .layout-band__content p { margin: 0; color: var(--muted-foreground); }
    </style>
    <section class="layout-band">
      <div class="page-width">
        <div class="layout-band__content">
          <strong>.page-width</strong>
          <p>Padded by --page-gutter: --gutter (16px, 24px from 990px) or more, so content stops at --content-max (1248px).</p>
        </div>
      </div>
    </section>`,
};

export const PageGutter = {
  play: async ({ canvasElement }) => {
    const band = canvasElement.querySelector('.page-width');
    await expect(Number.parseFloat(getComputedStyle(band).paddingLeft)).toBeGreaterThanOrEqual(16);
  },
};
