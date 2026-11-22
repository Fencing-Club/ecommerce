import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../assets/collection-breadcrumbs.js';

const filters = (deferred) => `
  <div class="${deferred ? 'collection-curated-filters-mobile' : 'collection-curated-filters-desktop'}">
    <nav class="collection-curated-filters">
      <input type="checkbox" aria-label="ASICS" name="filter.p.vendor" value="ASICS" data-filter-url="/collections/clothing?filter.p.vendor=ASICS">
      <input type="checkbox" aria-label="Yonex" name="filter.p.vendor" value="Yonex" data-filter-url="/collections/clothing" checked>
      <price-range>
        <input aria-label="From" name="filter.v.price.gte" value="">
        <input aria-label="To" name="filter.v.price.lte" value="100">
      </price-range>
    </nav>
    ${deferred ? '<button type="button" data-apply-collection-filters>Apply</button>' : ''}
  </div>`;

let assign;
beforeEach(() => {
  window.history.replaceState({}, '', '/collections/clothing?sort_by=price-ascending&filter.p.vendor=FWF&page=2');
  assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
});
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const check = (label) => {
  const input = document.querySelector(`[aria-label="${label}"]`);
  input.checked = !input.checked;
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('phone filter drawer', () => {
  it('waits for Apply, then replaces the filters and keeps the sort order', () => {
    document.body.innerHTML = filters(true);
    check('ASICS');
    expect(assign).not.toHaveBeenCalled();

    document.querySelector('[data-apply-collection-filters]').click();
    const destination = new URL(assign.mock.calls[0][0], window.location.origin);
    expect(destination.pathname).toBe('/collections/clothing');
    expect(destination.searchParams.getAll('filter.p.vendor')).toEqual(['ASICS', 'Yonex']);
    expect(destination.searchParams.get('filter.v.price.lte')).toBe('100');
    expect(destination.searchParams.has('filter.v.price.gte')).toBe(false);
    expect(destination.searchParams.get('sort_by')).toBe('price-ascending');
    expect(destination.searchParams.has('page')).toBe(false);
  });
});

describe('desktop filters', () => {
  it('still apply each choice straight away', () => {
    document.body.innerHTML = filters(false);
    check('ASICS');
    expect(assign).toHaveBeenCalledWith('/collections/clothing?filter.p.vendor=ASICS');
  });
});
