class CartDrawer extends HTMLElement {
  constructor() {
    super();
    this.addEventListener('keyup', event => event.code === 'Escape' && !event.defaultPrevented && this.close());
    this.addEventListener('click', event => {
      if (event.target.closest('#CartDrawer-Overlay, .drawer__close')) this.close();
    });
    this.setHeaderCartIconAccessibility();
  }

  setHeaderCartIconAccessibility() {
    const cartLink = document.querySelector('#cart-icon-bubble');
    if (!cartLink) return;
    cartLink.setAttribute('role', 'button');
    cartLink.setAttribute('aria-haspopup', 'dialog');
    cartLink.setAttribute('aria-controls', 'CartDrawer');
    cartLink.setAttribute('aria-expanded', 'false');
    cartLink.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      this.open(cartLink);
    });
    cartLink.addEventListener('keydown', event => {
      if (event.code.toUpperCase() === 'SPACE') {
        event.preventDefault();
        this.open(cartLink);
      }
    });
  }

  get items() {
    return this.querySelector('cart-drawer-items');
  }

  open(triggeredBy) {
    if (triggeredBy) this.setActiveElement(triggeredBy);
    if (this.dataset.loadState === 'failed' || this.hasAttribute('data-stale')) this.items?.refresh({ visible: true });
    if (this.classList.contains('active')) return;
    document.querySelector('#cart-icon-bubble')?.setAttribute('aria-expanded', 'true');
    this.classList.add('animate', 'active');
    this.focusFrame = requestAnimationFrame(() => {
      if (!this.classList.contains('active')) return;
      const container = this.querySelector('.fc-flyout');
      trapFocus(container, container.querySelector('.drawer__close'));
    });
    document.body.classList.add('overflow-hidden');
    // cart-drawer-items skips the automatic view event; it fires when the drawer opens.
    this.items?.dispatchViewEvent();
  }

  close() {
    cancelAnimationFrame(this.focusFrame);
    this.classList.remove('active');
    this.items?.hideAddedToast?.();
    document.querySelector('#cart-icon-bubble')?.setAttribute('aria-expanded', 'false');
    removeTrapFocus(this.activeElement);
    document.body.classList.remove('overflow-hidden');
  }

  /** Called by product forms after /cart/add.js with the sections from getSectionsToRender. */
  renderContents(parsedState) {
    this.productId = parsedState.id;
    const items = this.items;
    if (!parsedState.sections?.['cart-drawer']) {
      items?.refresh({ visible: true });
      this.open();
      return;
    }
    items.renderSections(parsedState.sections, items.getSectionsToRender());
    const added = parsedState.items ? parsedState.items[0] : parsedState;
    if (added?.key) items.showAddedToast(added);
    this.open();
  }

  getSectionsToRender() {
    return [{ id: 'cart-drawer', selector: '#CartDrawer' }, { id: 'cart-icon-bubble' }];
  }

  getSectionInnerHTML(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector).innerHTML;
  }

  setActiveElement(element) {
    this.activeElement = element;
  }
}

if (!customElements.get('cart-drawer')) customElements.define('cart-drawer', CartDrawer);

class CartDrawerItems extends CartItems {
  getSectionsToRender() {
    return [
      { id: 'CartDrawer', section: 'cart-drawer', selector: '[data-cart-state]' },
      { id: 'cart-icon-bubble', section: 'cart-icon-bubble', selector: '.shopify-section' },
    ];
  }
}

if (!customElements.get('cart-drawer-items')) customElements.define('cart-drawer-items', CartDrawerItems);
