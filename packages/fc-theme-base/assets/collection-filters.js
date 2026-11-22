/**
 * Collection filter navigation without Dawn's AJAX: a filter input goes to its Shopify URL, a price change sets the
 * range, Clear all keeps the sort, and the phone filter drawer collects choices and applies them together.
 */
for (const link of document.querySelectorAll('[data-clear-collection-filters]')) {
  const destination = new URL(link.href, window.location.origin);
  const sort = new URLSearchParams(window.location.search).get('sort_by');
  if (sort) destination.searchParams.set('sort_by', sort);
  link.href = `${destination.pathname}${destination.search}`;
}

// The phone filter drawer collects choices and applies them together, so its inputs don't navigate on change.
const deferredFilters = '.collection-curated-filters-mobile';

function deferredFilterDestination(container) {
  const destination = new URL(window.location.href);
  for (const name of [...destination.searchParams.keys()]) {
    if (name.startsWith('filter.')) destination.searchParams.delete(name);
  }
  destination.searchParams.delete('page');
  for (const input of container.querySelectorAll('.collection-curated-filters input[name^="filter."]')) {
    if (input.disabled) continue;
    if (input.type === 'checkbox' || input.type === 'radio') {
      if (input.checked) destination.searchParams.append(input.name, input.value);
    } else if (input.value.trim()) {
      destination.searchParams.set(input.name, input.value.trim());
    }
  }
  return `${destination.pathname}${destination.search}`;
}

document.addEventListener('click', event => {
  const apply = event.target.closest('[data-apply-collection-filters]');
  const container = apply?.closest(deferredFilters);
  if (container) window.location.assign(deferredFilterDestination(container));
});

document.addEventListener('change', event => {
  const input = event.target;
  if (input.closest(deferredFilters)) return;
  if (input.matches('.collection-curated-filters price-range input[name]')) {
    const destination = new URL(window.location.href);
    for (const field of input.closest('price-range').querySelectorAll('input[name]')) {
      destination.searchParams.delete(field.name);
      if (field.value.trim()) destination.searchParams.set(field.name, field.value);
    }
    destination.searchParams.delete('page');
    window.location.assign(`${destination.pathname}${destination.search}`);
    return;
  }
  if (!input.matches('input[data-filter-url]') || input.disabled) return;
  window.location.assign(input.dataset.filterUrl);
});