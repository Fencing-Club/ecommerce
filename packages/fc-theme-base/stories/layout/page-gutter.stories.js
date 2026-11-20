import { expect } from 'storybook/test';
import { articles, products } from '../fixtures.js';
import { assetUrl, renderSection } from '../liquid.js';

// Every section the templates and section groups place, rendered at each breakpoint and measured against the page
// gutter (docs/shopify-page-layout.md). A section added to a template is measured here with no extra work.

const parse = (text) => JSON.parse(text.replace(/^\s*\/\*[\s\S]*?\*\//, ''));
const fileName = (path) => path.slice(path.lastIndexOf('/') + 1, path.lastIndexOf('.'));
const templates = Object.entries(
  import.meta.glob('../../templates/*.json', { query: '?raw', import: 'default', eager: true }),
).map(([path, text]) => [fileName(path), parse(text)]);
const groups = Object.fromEntries(
  Object.entries(import.meta.glob('../../sections/*-group.json', { query: '?raw', import: 'default', eager: true })).map(
    ([path, text]) => [fileName(path), parse(text)],
  ),
);

// Sections whose content starts inside the gutter rather than on it, at widths from `from` to `to`. Each says why.
// Content still may not cross the gutter.
const centered = {
  'password/main': { reason: 'The password page centers its sign-up form.' },
  '404/main': { reason: 'The not-found page centers its message.' },
  'page/main': { reason: 'Pages read in the narrow column, which centers once the screen is wider than it.' },
  'header-group/header': {
    from: 990,
    to: 1249,
    reason: 'The logo slot collapses here, so the menu starts after the empty slot, as in the sticky header design.',
  },
};
const isCentered = (name, width) =>
  Boolean(centered[name]) && width >= (centered[name].from ?? 0) && width <= (centered[name].to ?? Infinity);

// The page resources the templates read, so sections render real text to measure.
const product = {
  ...products[0],
  handle: 'competition-jacket',
  vendor: 'Fencing Club',
  description: '<p>A light, breathable jacket for club and competition fencing.</p>',
  images: [products[0].featured_image],
  media: [{ id: 1, media_type: 'image', preview_image: products[0].featured_image, alt: products[0].title }],
  options_with_values: [{ name: 'Size', position: 1, values: ['S', 'M', 'L'] }],
  tags: [],
  metafields: {},
};
const article = {
  ...articles[0],
  author: 'Fencing Club',
  content: '<p>Start with a mask, a jacket, a glove and a weapon.</p>',
  blog: { title: 'Journal', url: '#blog' },
  tags: [],
};
const resources = {
  product,
  article,
  collection: {
    title: 'Clothing',
    handle: 'clothing',
    url: '#collection',
    products,
    products_count: products.length,
    all_products_count: products.length,
    filters: [],
    sort_options: [{ name: 'Featured', value: 'manual' }],
    sort_by: 'manual',
  },
  blog: { title: 'Journal', handle: 'journal', url: '#blog', articles, articles_count: articles.length },
  page: { title: 'About us', handle: 'about', content: '<p>Fencing gear for clubs and competitors.</p>' },
  search: {
    performed: true,
    terms: 'jacket',
    results: products.map((item) => ({ ...item, object_type: 'product' })),
    results_count: products.length,
    filters: [],
    sort_options: [],
  },
  request: { page_type: 'page' },
  shop: { name: 'Fencing Club' },
  linklists: {
    'main-menu': {
      links: ['Weapons', 'Masks', 'Clothing'].map((title) => ({ title, url: '#menu', handle: title.toLowerCase(), links: [] })),
    },
  },
};

const blocksOf = (section) =>
  (section.block_order ?? Object.keys(section.blocks ?? {})).map((id) => ({
    id,
    shopify_attributes: '',
    ...section.blocks[id],
    settings: section.blocks[id].settings ?? {},
  }));

// Shopify hands a section its menu settings as the menu itself, not the handle the JSON stores.
const resolved = (settings) =>
  Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, resources.linklists[value] ?? value]));

function renderGroup(name, sections) {
  return (sections.order ?? Object.keys(sections.sections))
    .filter((id) => !sections.sections[id].disabled)
    .map((id) => {
      const { type, settings = {} } = sections.sections[id];
      const section = { id, settings: resolved(settings), blocks: blocksOf(sections.sections[id]) };
      const html = renderSection(type, section, resources);
      return `<div class="shopify-section" data-gutter-section="${name}/${id}">${html}</div>`;
    })
    .join('');
}

// What layout/theme.liquid adds around the sections, beyond the CSS Storybook's preview already loads.
const layoutStylesheets = ['component-cookie-consent.css', 'component-price.css', 'component-localization-form.css'];

function pageHtml() {
  const head = [...document.head.querySelectorAll('style, link[rel="stylesheet"]')].map((node) => node.outerHTML);
  const links = layoutStylesheets.map((file) => `<link rel="stylesheet" href="${assetUrl(file)}">`);
  const main = templates.map(([name, template]) => renderGroup(name, template)).join('');
  return `<!doctype html><html class="js"><head>${head.join('')}${links.join('')}
    <style>html { scrollbar-width: none; }</style></head>
    <body><div class="header-group">${renderGroup('header-group', groups['header-group'])}</div>
    <main id="MainContent" class="content-for-layout">${main}</main>
    ${renderGroup('footer-group', groups['footer-group'])}</body></html>`;
}

// The page gutter in pixels at the frame's width, read from the token itself.
function gutterOf(frameDocument) {
  const probe = frameDocument.createElement('div');
  // Not empty: base.css hides empty divs.
  probe.style.cssText = 'display: block; width: var(--page-gutter); height: 1px;';
  probe.textContent = ' ';
  frameDocument.body.append(probe);
  const gutter = probe.getBoundingClientRect().width;
  probe.remove();
  return gutter;
}

// The horizontal span of a box left after every clipping ancestor, or null when nothing of it shows.
function visibleSpan(element, rect) {
  const view = element.ownerDocument.defaultView;
  let left = Math.max(rect.left, 0);
  let right = Math.min(rect.right, view.innerWidth);
  for (let node = element; node; node = node.parentElement) {
    const style = view.getComputedStyle(node);
    if (style.overflowX === 'visible' && style.clip === 'auto' && style.clipPath === 'none') continue;
    const box = node.getBoundingClientRect();
    left = Math.max(left, box.left);
    right = Math.min(right, box.right);
  }
  return right - left >= 2 ? { left, right, clipped: left > rect.left + 0.5 || right < rect.right - 0.5 } : null;
}

// The visible text and icons in a section, as horizontal spans.
function contentSpans(section, contentWidth) {
  const frameDocument = section.ownerDocument;
  const spans = [];
  const add = (element, rect, label) => {
    if (rect.width < 2 || rect.height < 2) return;
    if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return;
    const span = visibleSpan(element, rect);
    if (span) spans.push({ ...span, label });
  };
  const walker = frameDocument.createTreeWalker(section, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.data.trim();
    if (!text || node.parentElement.closest('style, script, template, noscript')) continue;
    const range = frameDocument.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) add(node.parentElement, rect, `"${text.slice(0, 40)}"`);
  }
  for (const icon of section.querySelectorAll('svg')) {
    const rect = icon.getBoundingClientRect();
    const where = [icon.parentElement, icon.parentElement.parentElement].map((node) => node.className || node.tagName);
    if (rect.width <= 48) add(icon, rect, `icon in ${where.join(' in ')}`);
  }
  // Images wider than the content are bleeds, such as the homepage hero, and may cross the gutter.
  for (const image of section.querySelectorAll('img')) {
    const rect = image.getBoundingClientRect();
    if (rect.width <= contentWidth) add(image, rect, `image "${image.alt}"`);
  }
  return spans;
}

/** Every way the page's content misses the gutter, as readable lines. */
function gutterProblems(frameDocument) {
  const width = frameDocument.defaultView.innerWidth;
  const gutter = gutterOf(frameDocument);
  const problems = [];
  for (const section of frameDocument.querySelectorAll('[data-gutter-section]')) {
    const name = section.dataset.gutterSection;
    const spans = contentSpans(section, width - 2 * gutter + 1);
    if (spans.length === 0) continue;
    const inside = spans.find((span) => span.left < gutter - 1 || (!span.clipped && span.right > width - gutter + 1));
    if (inside) {
      problems.push(`${name}: ${inside.label} spans ${Math.round(inside.left)}–${Math.round(inside.right)}px, outside the ${gutter}px gutter`);
    }
    const start = Math.min(...spans.map((span) => span.left));
    if (!isCentered(name, width) && Math.abs(start - gutter) > 1) {
      problems.push(`${name}: content starts at ${Math.round(start)}px, not on the ${gutter}px gutter`);
    }
  }
  return problems;
}

export default {
  title: 'Layout/Page gutter',
  parameters: { layout: 'fullscreen' },
  render: ({ width }) => {
    const frame = document.createElement('iframe');
    frame.title = `Every section at ${width}px`;
    // Tall enough that Dawn's "constrain to screen height" media keep their full width, as on a desktop screen.
    frame.style.cssText = `width: ${width}px; height: 1200px; border: 0; display: block;`;
    frame.srcdoc = pageHtml();
    return frame;
  },
  play: async ({ canvasElement }) => {
    const frame = canvasElement.querySelector('iframe');
    await new Promise((resolve) => {
      if (frame.contentDocument?.readyState === 'complete' && frame.contentDocument.body?.childElementCount) resolve();
      else frame.addEventListener('load', resolve, { once: true });
    });
    await frame.contentDocument.fonts.ready;
    await expect(frame.contentDocument.querySelectorAll('[data-gutter-section]').length).toBeGreaterThan(0);
    await expect(gutterProblems(frame.contentDocument)).toEqual([]);
  },
};

export const Phone = { args: { width: 390 } };
export const Tablet = { args: { width: 768 } };
export const Laptop = { args: { width: 1100 } };
export const Desktop = { args: { width: 1440 } };
export const Wide = { args: { width: 1920 } };
