import { expect, waitFor } from 'storybook/test';

// Page layout: every full-width band lines its content up on one gutter (docs/shopify-page-layout.md). The gutter
// depends on the screen width, so each page size renders in its own frame: the muted band is the page, the dark box is
// where content goes.
const sizes = [
  { name: 'Phone', width: 390 },
  { name: 'Tablet', width: 768 },
  { name: 'Laptop', width: 1100 },
  { name: 'Desktop', width: 1440 },
  { name: 'Wide', width: 1920 },
];

function frameHtml() {
  const head = [...document.head.querySelectorAll('style, link[rel="stylesheet"]')].map((node) => node.outerHTML);
  return `<!doctype html><html><head>${head.join('')}
    <style>
      body { margin: 0; background: var(--background); }
      .gutter-band { background: var(--muted); padding-block: var(--spacing-4); }
      .gutter-content { display: block; min-height: var(--spacing-12); border-radius: var(--radius-sm); background: var(--primary); }
    </style></head>
    <body><div class="page-width gutter-band"><div class="gutter-content" data-gutter-content>&nbsp;</div></div></body></html>`;
}

export default {
  title: 'Foundations/Layout',
  parameters: { layout: 'fullscreen' },
  render: () => {
    const html = frameHtml();
    const list = document.createElement('div');
    // Wider sizes scroll sideways, so the region takes keyboard focus.
    list.tabIndex = 0;
    list.setAttribute('role', 'region');
    list.setAttribute('aria-label', 'Page gutter at each page size');
    list.style.cssText = 'display: grid; gap: var(--spacing-6); padding: var(--spacing-6) 0; overflow-x: auto;';
    for (const { name, width } of sizes) {
      const figure = document.createElement('figure');
      figure.style.cssText = 'margin: 0;';
      figure.innerHTML = `<figcaption style="padding: 0 var(--spacing-4) var(--spacing-2); font-size: var(--text-sm); color: var(--muted-foreground);">${name}, ${width}px</figcaption>`;
      const frame = document.createElement('iframe');
      frame.title = `Page gutter at ${width}px`;
      frame.dataset.width = String(width);
      frame.style.cssText = `width: ${width}px; height: 80px; border: 0; display: block;`;
      frame.srcdoc = html;
      figure.append(frame);
      list.append(figure);
    }
    return list;
  },
};

// The gutter is 16px below 990px and 24px from there, until the 1248px content width centers.
const expectedGutter = (width) => Math.max(width < 990 ? 16 : 24, (width - 1248) / 2);

export const PageGutter = {
  play: async ({ canvasElement }) => {
    const frames = [...canvasElement.querySelectorAll('iframe')];
    await expect(frames).toHaveLength(sizes.length);
    for (const frame of frames) {
      const width = Number(frame.dataset.width);
      // Each frame loads the theme's stylesheets on its own, so wait until they apply.
      await waitFor(() => {
        const content = frame.contentDocument?.querySelector('[data-gutter-content]')?.getBoundingClientRect();
        expect({ width, left: content?.left, right: content && width - content.right }).toEqual({
          width,
          left: expectedGutter(width),
          right: expectedGutter(width),
        });
      });
    }
  },
};
