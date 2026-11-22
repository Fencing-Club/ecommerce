/**
 * The collection page's small controls: Read more under the description, hiding the filter panel, products per row,
 * opening a branch of the category tree, Show more in a long filter, and the counts and best sellers the no-results
 * panel loads. The panel and products-per-row choices are remembered in this browser.
 */
const remember = (key, value) => {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    // Blocked storage just means the page doesn't remember.
  }
  return null;
};

function swapLabels(button, open, openSelector, closedSelector) {
  button.querySelector(openSelector)?.toggleAttribute('hidden', !open);
  button.querySelector(closedSelector)?.toggleAttribute('hidden', open);
}

function showFilters(open) {
  const layout = document.querySelector('[data-collection-layout]');
  if (!layout) return;
  layout.toggleAttribute('data-filters-hidden', !open);
  for (const toggle of document.querySelectorAll('[data-filters-toggle]')) {
    toggle.setAttribute('aria-expanded', String(open));
    swapLabels(toggle, open, '[data-filters-open]', '[data-filters-closed]');
  }
}

function showColumns(columns) {
  const layout = document.querySelector('[data-collection-layout]');
  if (!layout) return;
  layout.style.setProperty('--collection-columns', columns);
  for (const option of document.querySelectorAll('.collection-density__option')) {
    option.setAttribute('aria-pressed', String(option.dataset.columns === columns));
  }
}

if (remember('fc:collection-filters') === 'hidden') showFilters(false);
const savedColumns = remember('fc:collection-columns');
if (savedColumns === '3' || savedColumns === '4') showColumns(savedColumns);

// Read more shows only while the description is cut short, which changes as the page gets wider or narrower.
const readMoreSizes = new ResizeObserver((entries) => {
  for (const { target: text } of entries) {
    const button = document.querySelector(`[data-read-more][aria-controls="${text.id}"]`);
    if (button) button.hidden = text.hasAttribute('data-expanded') || text.scrollHeight <= text.clientHeight + 1;
  }
});
for (const button of document.querySelectorAll('[data-read-more]')) {
  const text = document.getElementById(button.getAttribute('aria-controls'));
  if (text) readMoreSizes.observe(text);
}

function onClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const filtersToggle = target.closest('[data-filters-toggle]');
  if (filtersToggle) {
    const open = filtersToggle.getAttribute('aria-expanded') !== 'true';
    showFilters(open);
    remember('fc:collection-filters', open ? 'shown' : 'hidden');
    return;
  }

  const density = target.closest('.collection-density__option');
  if (density) {
    showColumns(density.dataset.columns);
    remember('fc:collection-columns', density.dataset.columns);
    return;
  }

  const readMore = target.closest('[data-read-more]');
  if (readMore) {
    document.getElementById(readMore.getAttribute('aria-controls'))?.setAttribute('data-expanded', '');
    readMore.setAttribute('aria-expanded', 'true');
    readMore.hidden = true;
    return;
  }

  const treeToggle = target.closest('[data-tree-toggle]');
  if (treeToggle) {
    const open = treeToggle.getAttribute('aria-expanded') !== 'true';
    treeToggle.setAttribute('aria-expanded', String(open));
    document.getElementById(treeToggle.getAttribute('aria-controls'))?.toggleAttribute('hidden', !open);
    return;
  }

  const more = target.closest('[data-filter-more]');
  if (more) {
    const open = more.getAttribute('aria-expanded') !== 'true';
    more.setAttribute('aria-expanded', String(open));
    swapLabels(more, open, '[data-more-open]', '[data-more-closed]');
    for (const option of more.closest('details')?.querySelectorAll('[data-filter-extra]') ?? []) option.hidden = !open;
  }
}

// One listener for the page, however many times the script is added.
if (!window.collectionPageListening) {
  window.collectionPageListening = true;
  document.addEventListener('click', onClick);
}

async function loadSection(url, sectionId) {
  const address = new URL(url, window.location.origin);
  address.searchParams.set('section_id', sectionId);
  const response = await fetch(address);
  if (!response.ok) throw new Error(`Loading ${address.pathname} failed with ${response.status}`);
  return new DOMParser().parseFromString(await response.text(), 'text/html');
}

for (const panel of document.querySelectorAll('.collection-no-results')) {
  const sectionId = panel.dataset.id;
  for (const suggestion of panel.querySelectorAll('[data-suggestion-url]')) {
    loadSection(suggestion.dataset.suggestionUrl, sectionId)
      .then((page) => {
        const count = page.querySelector('#ProductCount');
        const label = suggestion.querySelector('[data-filter-chip-count]');
        if (count && label) label.textContent = count.textContent.trim();
      })
      .catch(() => {});
  }

  const fallback = panel.querySelector('[data-best-sellers]');
  if (fallback) {
    loadSection(fallback.dataset.bestSellers, fallback.dataset.sectionId)
      .then((page) => {
        const items = [...page.querySelectorAll('#product-grid > li')].slice(0, 4);
        if (!items.length) return;
        fallback.querySelector('[data-best-sellers-grid]')?.append(...items);
        fallback.hidden = false;
      })
      .catch(() => {});
  }
}
