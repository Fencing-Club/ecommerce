/*
 * Cart flyout and cart page controller.
 *
 * Both views mark the parts that change with data-cart-region. After every cart request the views fetch their
 * section again and swap only those regions, so open editors, unsaved notes and scroll position survive.
 * Every request goes through one queue (CartItems.mutate); checkout waits until the queue is empty.
 */
// Shopify's t filter HTML-escapes translations, so window.cartStrings holds entities such as &#39;.
const cartText = (key, replacements = {}) => {
  let text = new DOMParser().parseFromString(window.cartStrings?.[key] || '', 'text/html').documentElement.textContent;
  for (const [name, value] of Object.entries(replacements)) text = text.replace(`[${name}]`, value);
  return text;
};

class CartRemoveButton extends HTMLElement {
  constructor() {
    super();
    this.addEventListener('click', event => {
      event.preventDefault();
      const view = this.closest('cart-items, cart-drawer-items');
      const row = this.closest('.fc-line');
      // Edit and remove stay usable while the row updates, so a second click mustn't remove it twice.
      if (!row || row.hasAttribute('data-removing')) return;
      row.setAttribute('data-removing', '');
      // A quantity change still waiting on the debounce goes first, so it can't land after the removal.
      view?.flushQuantity();
      view?.updateQuantity(row?.dataset.line, 0, event);
    });
  }
}

if (!customElements.get('cart-remove-button')) customElements.define('cart-remove-button', CartRemoveButton);

class CartItems extends window.StandardEvents.createViewEventElement(HTMLElement) {
  static pendingCartDataPromise = null;
  static mutationCount = 0;
  static mutationQueue = Promise.resolve();
  static pendingQuantities = new Set();

  constructor() {
    super();
    this.addEventListener('change', event => {
      if (!event.target.matches('input[data-index]')) return;
      clearTimeout(this.quantityTimer);
      this.pendingChange = event;
      CartItems.pendingQuantities.add(this);
      CartItems.updateCheckoutState();
      this.quantityTimer = setTimeout(() => this.flushQuantity(), ON_CHANGE_DEBOUNCE_TIMER);
    });
    this.addEventListener('click', event => {
      const retry = event.target.closest('[data-cart-retry]');
      const undo = event.target.closest('[data-undo-remove]');
      if (retry) this.refresh({ visible: true });
      else if (undo) this.undoRemove(undo.closest('.fc-line--removed'));
    });
  }

  cartUpdateUnsubscriber = undefined;

  /** The element that holds the whole view: the drawer for the flyout, this element for the page. */
  get viewRoot() {
    return this.closest('cart-drawer') || this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.cartUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.cartUpdate, event => {
      if (event.source === 'cart-items') return;
      return this.onCartUpdate();
    });
  }

  /** Sends the quantity change waiting on the debounce now. */
  flushQuantity() {
    clearTimeout(this.quantityTimer);
    const event = this.pendingChange;
    this.pendingChange = null;
    CartItems.pendingQuantities.delete(this);
    if (event) this.onChange(event);
    CartItems.updateCheckoutState();
  }

  disconnectedCallback() {
    clearTimeout(this.quantityTimer);
    this.pendingChange = null;
    CartItems.pendingQuantities.delete(this);
    this.cartUpdateUnsubscriber?.();
  }

  static mutate(operation) {
    CartItems.mutationCount += 1;
    CartItems.updateCheckoutState();
    const result = CartItems.mutationQueue.then(operation);
    CartItems.mutationQueue = result.catch(() => {});
    return result.finally(() => {
      CartItems.mutationCount -= 1;
      CartItems.updateCheckoutState();
    });
  }

  // Fetches the full cart. De-duplicated across concurrent callers.
  static fetchCartData() {
    if (!CartItems.pendingCartDataPromise) {
      const pendingCartDataPromise = fetch(`${routes.cart_url}.js`)
        .then(response => (response.ok ? response.json() : null))
        .catch(() => null)
        .finally(() => {
          if (CartItems.pendingCartDataPromise === pendingCartDataPromise) CartItems.pendingCartDataPromise = null;
        });
      CartItems.pendingCartDataPromise = pendingCartDataPromise;
    }
    return CartItems.pendingCartDataPromise;
  }

  /**
   * Works out each checkout button's state. Waiting covers queued requests and the quantity debounce; the
   * reasons a shopper can fix themselves come next, so the message under the button says what to do.
   */
  static updateCheckoutState() {
    const waiting = CartItems.mutationCount > 0 || CartItems.pendingQuantities.size > 0;
    const unsavedNote = [...document.querySelectorAll('cart-note')].some(note => note.isDirty);
    document.querySelectorAll('[data-checkout-state]').forEach(holder => {
      const view = holder.closest('cart-drawer, cart-items');
      if (!view) return;
      const unavailable = view.querySelectorAll('.fc-line[data-unavailable]').length;
      let state = 'ready';
      let reason = '';
      let tone = 'error';
      if (holder.hasAttribute('data-opening')) state = 'opening';
      else if (waiting) state = 'waiting';
      else if (unsavedNote) {
        state = 'blocked';
        reason = cartText('blockedNote');
        tone = 'info';
      } else if (unavailable > 0) {
        state = 'blocked';
        reason = cartText(unavailable === 1 ? 'blockedUnavailableOne' : 'blockedUnavailableOther', { count: unavailable });
      } else if (holder.hasAttribute('data-failed')) {
        state = 'failed';
        reason = cartText('checkoutFailed');
      }
      holder.dataset.checkoutState = state;
      holder.dataset.reasonTone = tone;
      const button = holder.querySelector('button[name="checkout"]');
      if (button) button.disabled = ['waiting', 'opening', 'blocked'].includes(state) || view.dataset.cartState === 'empty';
      const text = holder.querySelector('[data-checkout-reason]');
      if (text && text.textContent !== reason) text.textContent = reason;
    });
    document.documentElement.toggleAttribute('data-cart-busy', CartItems.mutationCount > 0);
  }

  /** Copies the state the shopper is in the middle of into freshly rendered markup. */
  static preserveControls(target, source) {
    target.querySelectorAll('details[open][id]').forEach(details => {
      source.querySelector(`#${CSS.escape(details.id)}`)?.setAttribute('open', '');
    });
  }

  /** Starts a new reward fill at the old width so it grows or shrinks to the new one; CSS sets the transition. */
  static animateFill(fill, from) {
    const to = fill?.style.width;
    if (!from || !to || from === to) return;
    fill.style.width = from;
    fill.getBoundingClientRect();
    fill.style.width = to;
  }

  /** Swaps every region in the view for the matching region in the rendered section. */
  static applyRegions(root, html) {
    const sourceRoot = html.querySelector('[data-cart-state]');
    root.querySelectorAll('[data-cart-region]').forEach(region => {
      const source = html.querySelector(`[data-cart-region="${region.dataset.cartRegion}"]`);
      if (!source) return;
      CartItems.preserveControls(region, source);
      const fillFrom = region.querySelector('.fc-progress__fill')?.style.width;
      region.replaceChildren(...source.childNodes);
      CartItems.animateFill(region.querySelector('.fc-progress__fill'), fillFrom);
    });
    if (sourceRoot) root.dataset.cartState = sourceRoot.dataset.cartState;
    root.dispatchEvent(new CustomEvent('cart:regions-updated', { bubbles: true }));
  }

  getSectionsToRender() {
    return [
      { id: 'main-cart', section: this.dataset.id, selector: '[data-cart-state]' },
      { id: 'cart-icon-bubble', section: 'cart-icon-bubble', selector: '.shopify-section' },
      { id: 'cart-live-region-text', section: 'cart-live-region-text', selector: '.shopify-section' },
    ];
  }

  /** Puts rendered sections into the page. sections maps a section id to its HTML. */
  renderSections(sections, entries = this.getSectionsToRender()) {
    entries.forEach(entry => {
      const markup = sections?.[entry.section];
      if (!markup) return;
      const html = new DOMParser().parseFromString(markup, 'text/html');
      if (entry.id === 'main-cart' || entry.id === 'CartDrawer') {
        CartItems.applyRegions(this.viewRoot, html);
        return;
      }
      const target = document.getElementById(entry.id);
      const source = html.querySelector(entry.selector);
      if (!target || !source) return;
      (target.querySelector(entry.selector) || target).innerHTML = source.innerHTML;
    });
    delete this.viewRoot.dataset.loadState;
    CartItems.updateCheckoutState();
    customElements.get('cart-discount')?.syncShippingCodes?.();
  }

  async fetchSections() {
    const entries = this.getSectionsToRender();
    const response = await fetch(`${routes.cart_url}?sections=${entries.map(entry => entry.section).join(',')}`);
    if (!response.ok) throw new Error(`Cart sections returned ${response.status}`);
    const sections = await response.json();
    if (!entries.every(entry => sections[entry.section])) throw new Error('Cart sections missing');
    return { sections, entries };
  }

  /** Reloads the view. A visible refresh shows the loading skeleton; any failure shows the load failed message. */
  async refresh({ visible = false } = {}) {
    const root = this.viewRoot;
    if (visible) root.dataset.loadState = 'loading';
    delete root.dataset.stale;
    try {
      const { sections, entries } = await this.fetchSections();
      this.renderSections(sections, entries);
    } catch (error) {
      console.error(error);
      root.dataset.loadState = 'failed';
      if (visible) root.querySelector('[data-cart-retry]')?.focus({ preventScroll: true });
    }
  }

  onCartUpdate() {
    return this.refresh();
  }

  lineByKey(key) {
    return [...this.querySelectorAll('.fc-line[data-line-key]')].find(row => row.dataset.lineKey === key);
  }

  lineByIndex(line) {
    return this.querySelector(`.fc-line[data-line="${line}"]`);
  }

  resetQuantityInput(line) {
    const input = this.lineByIndex(line)?.querySelector('input[data-index]');
    if (!input) return;
    input.value = input.getAttribute('value');
    input.closest('quantity-input')?.validateQtyRules?.();
  }

  setValidity(event, line, message) {
    event.target.setCustomValidity(message);
    event.target.reportValidity();
    this.resetQuantityInput(line);
    event.target.select();
  }

  validateQuantity(event) {
    const input = event.target;
    const value = parseInt(input.value);
    const line = input.dataset.index;
    if (!Number.isFinite(value)) {
      this.resetQuantityInput(line);
      return;
    }
    let message = '';
    if (value > 0 && value < Number(input.dataset.min)) message = window.quickOrderListStrings.min_error.replace('[min]', input.dataset.min);
    else if (input.max && value > parseInt(input.max)) message = window.quickOrderListStrings.max_error.replace('[max]', input.max);
    else if (value % parseInt(input.step) !== 0) message = window.quickOrderListStrings.step_error.replace('[step]', input.step);
    if (message) {
      this.setValidity(event, line, message);
      return;
    }
    input.setCustomValidity('');
    this.updateQuantity(line, value, event, document.activeElement?.getAttribute('name'));
  }

  onChange(event) {
    if (!event.target.matches('input[data-index]')) return;
    this.validateQuantity(event);
  }

  setLineFeedback(row, message, tone = 'error') {
    const feedback = row?.querySelector('.fc-feedback');
    if (!feedback) return;
    feedback.dataset.tone = tone;
    feedback.querySelector('.fc-feedback__text').textContent = message;
    feedback.hidden = !message;
  }

  /** Changes one line's quantity; 0 removes it. Only the changed row shows progress or errors. */
  updateQuantity(line, quantity, event, focusName) {
    const row = this.lineByIndex(line);
    if (!row) return;
    const input = row.querySelector('input[data-index]');
    const key = row.dataset.lineKey;
    const variantId = row.dataset.variantId;
    const removing = quantity === 0;
    const snapshot = {
      variantId,
      quantity: Number(row.dataset.quantity),
      title: row.dataset.title,
      properties: JSON.parse(row.dataset.properties || '{}'),
      sellingPlan: row.dataset.sellingPlan || null,
    };
    const eventTarget = event?.currentTarget instanceof CartRemoveButton ? 'clear' : 'change';
    const marker = window.CartPerformance?.createStartingMarker(`${eventTarget}:user-action`);
    const deferred = this.createCartLinesUpdateEvent(removing ? 'remove' : 'update', variantId, quantity, key);
    const entries = this.getSectionsToRender();
    const body = JSON.stringify({ id: key, quantity, sections: entries.map(entry => entry.section), sections_url: window.location.pathname });

    this.setLineFeedback(row, '');
    row.dataset.state = 'updating';
    this.clearJustAdded();

    return CartItems.mutate(async () => {
      let state;
      let status = 0;
      try {
        const response = await fetch(routes.cart_change_url, { ...fetchConfig(), body });
        status = response.status;
        state = await response.json();
        if (!response.ok || state.errors || state.status) throw new Error(state.description || state.errors || state.message || 'Cart change failed');
      } catch (error) {
        const current = this.lineByKey(key) || row;
        delete current.dataset.state;
        current.removeAttribute('data-removing');
        row.removeAttribute('data-removing');
        this.resetQuantityInput(current.dataset.line);
        const stock = Number(input?.dataset.stock);
        if (removing) this.setLineFeedback(current, cartText('removeError'));
        else if (status === 422 && Number.isFinite(stock) && quantity > stock) this.setLineFeedback(current, cartText('stockLimit', { count: stock }), 'info');
        else this.setLineFeedback(current, cartText('quantityChangeError'));
        this.dispatchCartErrorEvent(error.message, status === 422 ? 'INVALID' : 'SERVICE_UNAVAILABLE');
        deferred?.reject(error);
        return;
      }

      this.resolveCartLinesUpdate(deferred, state);
      const lines = [...this.querySelectorAll('[data-cart-lines] > .fc-line')];
      const position = lines.indexOf(row);
      this.renderSections(state.sections, entries);
      this.announce();

      if (removing) {
        this.showRemoved(position, snapshot);
      } else {
        const updated = state.items?.find(item => item.key === key);
        const current = this.lineByKey(key);
        if (updated && current && updated.quantity < quantity) this.setLineFeedback(current, cartText('stockLimit', { count: updated.quantity }), 'info');
        const control = focusName && current?.querySelector(`[name="${focusName}"]`);
        if (control) this.focusInView(control);
      }

      publish(PUB_SUB_EVENTS.cartUpdate, { source: 'cart-items', cartData: state, variantId });
      if (marker) window.CartPerformance.measureFromMarker(`${eventTarget}:user-action`, marker);
      await Promise.all([...document.querySelectorAll('cart-items, cart-drawer-items')].filter(view => view !== this).map(view => view.onCartUpdate()));
    });
  }

  focusInView(element) {
    const drawer = this.closest('cart-drawer');
    if (drawer?.classList.contains('active') && typeof trapFocus === 'function') trapFocus(drawer.querySelector('.fc-flyout'), element);
    else element.focus({ preventScroll: true });
  }

  /** Leaves a row where the removed product was, with Undo. It stays until the next cart change. */
  showRemoved(position, snapshot) {
    const list = this.querySelector('[data-cart-lines]');
    const template = this.querySelector('template[data-removed-template]');
    if (!list || !template || this.viewRoot.dataset.cartState === 'empty') return;
    const row = template.content.firstElementChild.cloneNode(true);
    row.snapshot = snapshot;
    row.querySelector('[data-removed-text]').textContent = cartText('removed', { title: snapshot.title });
    const feedback = row.querySelector('.fc-feedback');
    feedback.id = `${feedback.id}-${Date.now()}`;
    list.insertBefore(row, list.children[position] || null);
    this.focusInView(row.querySelector('[data-undo-remove]'));
  }

  undoRemove(row) {
    const snapshot = row?.snapshot;
    if (!snapshot || row.hasAttribute('data-busy')) return;
    const button = row.querySelector('[data-undo-remove]');
    row.setAttribute('data-busy', '');
    button.disabled = true;
    this.setLineFeedback(row, '');
    const item = { id: Number(snapshot.variantId), quantity: snapshot.quantity };
    // Liquid serializes empty line properties as [], which /cart/add rejects.
    const { properties } = snapshot;
    if (properties && !Array.isArray(properties) && Object.keys(properties).length) item.properties = properties;
    if (snapshot.sellingPlan) item.selling_plan = Number(snapshot.sellingPlan);
    return this.addItems([item], () => {
      row.removeAttribute('data-busy');
      button.disabled = false;
      this.setLineFeedback(row, cartText('undoError', { title: snapshot.title }));
    });
  }

  /** Adds items through the queue and renders the result. onError runs when the request fails. */
  addItems(items, onError) {
    const entries = this.getSectionsToRender();
    this.clearJustAdded();
    return CartItems.mutate(async () => {
      let state;
      try {
        const response = await fetch(routes.cart_add_url, { ...fetchConfig(), body: JSON.stringify({ items, sections: entries.map(entry => entry.section), sections_url: window.location.pathname }) });
        state = await response.json();
        if (!response.ok || state.status) throw new Error(state.description || state.message || 'Cart add failed');
      } catch (error) {
        onError?.(error);
        this.dispatchCartErrorEvent(error.message, 'SERVICE_UNAVAILABLE');
        return;
      }
      this.renderSections(state.sections, entries);
      this.announce();
      const added = state.items?.[0];
      const row = added && this.lineByKey(added.key);
      if (row) this.focusInView(row.querySelector('.fc-line__name'));
      publish(PUB_SUB_EVENTS.cartUpdate, { source: 'cart-items', cartData: state });
      await Promise.all([...document.querySelectorAll('cart-items, cart-drawer-items')].filter(view => view !== this).map(view => view.onCartUpdate()));
    });
  }

  markJustAdded(item) {
    const row = this.lineByKey(item.key);
    if (row) row.dataset.justAdded = '';
    const toast = this.viewRoot.querySelector('[data-cart-toast]');
    if (toast && item.product_title) {
      toast.querySelector('[data-cart-toast-text]').textContent = cartText('itemAdded', { title: item.product_title });
      toast.hidden = false;
    }
  }

  clearJustAdded() {
    this.viewRoot.querySelectorAll('.fc-line[data-just-added]').forEach(row => row.removeAttribute('data-just-added'));
    const toast = this.viewRoot.querySelector('[data-cart-toast]');
    if (toast) toast.hidden = true;
  }

  announce() {
    const status = this.querySelector('#cart-live-region-text, #CartDrawer-LiveRegionText');
    const source = document.getElementById('cart-live-region-text');
    if (status && source && status !== source) status.textContent = source.textContent;
  }

  createCartLinesUpdateEvent(action, variantId, quantity, lineKey) {
    const { CartLinesUpdateEvent } = window.StandardEvents || {};
    if (!CartLinesUpdateEvent || !variantId || !lineKey) return null;
    const deferred = CartLinesUpdateEvent.createPromise();
    this.dispatchEvent(new CartLinesUpdateEvent({ action, context: 'cart', lines: [{ id: lineKey, quantity }], promise: deferred.promise }));
    return deferred;
  }

  resolveCartLinesUpdate(deferred, parsedState) {
    const { CartLinesUpdateEvent } = window.StandardEvents || {};
    if (!deferred || !CartLinesUpdateEvent) return;
    deferred.resolve({ cart: CartLinesUpdateEvent.createCartFromAjaxResponse(parsedState) });
  }

  dispatchCartErrorEvent(message, code) {
    const { CartErrorEvent } = window.StandardEvents || {};
    if (!CartErrorEvent) return;
    this.dispatchEvent(new CartErrorEvent({ error: message, code }));
  }
}

if (!customElements.get('cart-items')) customElements.define('cart-items', CartItems);

if (!window.cartCheckoutGuard) {
  window.cartCheckoutGuard = true;
  const pendingKey = 'fc-cart-checkout-pending';

  document.addEventListener('submit', event => {
    if (!['cart', 'CartDrawer-Form'].includes(event.target.id)) return;
    const submitter = event.submitter;
    if (!submitter?.matches('[name="checkout"]')) return;
    const holder = submitter.closest('[data-checkout-state]');
    CartItems.updateCheckoutState();
    if (holder && holder.dataset.checkoutState !== 'ready' && holder.dataset.checkoutState !== 'failed') {
      event.preventDefault();
      const note = [...document.querySelectorAll('cart-note')].find(element => element.isDirty && element.closest('cart-drawer, cart-items') === submitter.closest('cart-drawer, cart-items'));
      note?.reveal();
      return;
    }
    document.querySelectorAll('[data-checkout-state]').forEach(element => element.removeAttribute('data-failed'));
    holder?.setAttribute('data-opening', '');
    CartItems.updateCheckoutState();
    try {
      sessionStorage.setItem(pendingKey, String(Date.now()));
    } catch {}
  });

  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    document.querySelectorAll('[data-checkout-state]').forEach(element => element.removeAttribute('data-opening'));
    try {
      sessionStorage.removeItem(pendingKey);
    } catch {}
    document.querySelectorAll('cart-items').forEach(view => view.refresh({ visible: true }));
    document.querySelectorAll('cart-drawer').forEach(drawer => {
      drawer.dataset.stale = '';
    });
    CartItems.updateCheckoutState();
  });

  // Shopify sends the shopper back to the cart when checkout can't start.
  document.addEventListener('DOMContentLoaded', () => {
    let pending = null;
    try {
      pending = Number(sessionStorage.getItem(pendingKey));
      sessionStorage.removeItem(pendingKey);
    } catch {}
    const navigation = performance.getEntriesByType?.('navigation')?.[0];
    const returned = pending && Date.now() - pending < 30000 && navigation?.type === 'navigate' && !document.referrer.includes('/checkouts/');
    if (returned) document.querySelectorAll('[data-checkout-state]').forEach(element => element.setAttribute('data-failed', ''));
    CartItems.updateCheckoutState();
  });
}
