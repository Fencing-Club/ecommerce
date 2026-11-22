if (!customElements.get('collection-load-more')) {
  /**
   * Appends the next page of products to the collection grid instead of leaving the current page. The link stays a
   * normal page link, so it still works before this script runs or when a fetch fails.
   */
  class CollectionLoadMore extends HTMLElement {
    connectedCallback() {
      this.addEventListener('click', this.onClick);
    }

    disconnectedCallback() {
      this.removeEventListener('click', this.onClick);
    }

    onClick = async (event) => {
      const link = event.target.closest('a.ui-pagination__next');
      if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (this.loading) return;
      this.loading = true;
      link.setAttribute('aria-disabled', 'true');
      this.setAttribute('aria-busy', 'true');

      try {
        const url = new URL(link.href, window.location.origin);
        url.hash = '';
        url.searchParams.set('section_id', this.dataset.sectionId);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Loading more products failed with ${response.status}`);
        const page = new DOMParser().parseFromString(await response.text(), 'text/html');
        const items = [...page.querySelectorAll('#product-grid > li')];
        document.getElementById('product-grid')?.append(...items);

        const next = page.querySelector('collection-load-more');
        const nextLink = next?.querySelector('a.ui-pagination__next');
        if (nextLink) {
          const nextUrl = new URL(nextLink.getAttribute('href'), window.location.origin);
          nextUrl.searchParams.delete('section_id');
          nextLink.setAttribute('href', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
          this.replaceChildren(...next.childNodes);
        } else {
          this.remove();
        }

        items[0]?.querySelector('a[href]')?.focus({ preventScroll: true });
      } catch {
        window.location.assign(link.href);
      } finally {
        this.loading = false;
        this.removeAttribute('aria-busy');
        link.removeAttribute('aria-disabled');
      }
    };
  }

  customElements.define('collection-load-more', CollectionLoadMore);
}
