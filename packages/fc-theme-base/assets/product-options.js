/**
 * `<product-options>` wraps a product's option pickers, its add to cart form and what depends on the chosen variant.
 * Picking a value names it in the option's label. Once every option has a value, it finds the variant and swaps in
 * the section's fresh markup for it, so price, stock and the button come from Liquid. Add to cart before a value is
 * picked asks for it instead. It announces the variant with a `product-options:variant` event, and the fresh markup
 * with `product-options:render`. With `data-update-url`, as on the product page, the address follows the variant.
 */
class ProductOptions extends HTMLElement {
  connectedCallback() {
    this.addEventListener('change', this.onChange);
    // Capture runs before the product form's own submit handler.
    this.addEventListener('submit', this.onSubmit, true);
  }

  disconnectedCallback() {
    this.removeEventListener('change', this.onChange);
    this.removeEventListener('submit', this.onSubmit, true);
  }

  get variants() {
    try {
      return JSON.parse(this.querySelector('[data-product-variants]')?.textContent ?? '[]');
    } catch {
      return [];
    }
  }

  get pickers() {
    return [...this.querySelectorAll('fieldset[data-option-position]')];
  }

  onChange = (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches('[data-option-value-id]')) return;
    const picker = input.closest('fieldset');
    const label = picker?.querySelector('[data-option-selected]');
    if (label) label.textContent = input.dataset.optionLabel ?? input.value;
    this.querySelector('[data-option-error]')?.setAttribute('hidden', '');

    // Pickers can sit in a different order from Shopify's options, so each one fills its option's position.
    const chosen = [];
    for (const fieldset of this.pickers) {
      chosen[Number(fieldset.dataset.optionPosition) - 1] = fieldset.querySelector('input:checked')?.value;
    }
    if (this.pickers.length === 0 || chosen.length !== this.pickers.length || chosen.includes(undefined)) return;
    const variant = this.variants.find((candidate) => candidate.options.every((value, index) => value === chosen[index]));
    if (!variant) return;
    this.dispatchEvent(new CustomEvent('product-options:variant', { bubbles: true, detail: { variant } }));
    this.load(variant.id, input.id);
  };

  onSubmit = (event) => {
    // The product page has a second product form, for the installments line, so read the one being sent.
    const variantInput = event.target.querySelector('input[name="id"]');
    if (!variantInput || variantInput.value) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const unpicked = this.pickers.find((fieldset) => !fieldset.querySelector('input:checked'));
    const error = this.querySelector('[data-option-error]');
    if (error) {
      error.textContent = variantInput.dataset.chooseMessage ?? '';
      error.removeAttribute('hidden');
    }
    unpicked?.querySelector('input')?.focus();
  };

  async load(variantId, focusId) {
    const address = new URL(this.dataset.url, window.location.origin);
    address.searchParams.set('variant', variantId);
    address.searchParams.set('section_id', this.dataset.section);
    this.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch(address);
      if (!response.ok) throw new Error(`Loading the variant failed with ${response.status}`);
      const page = new DOMParser().parseFromString(await response.text(), 'text/html');
      const fresh = page.querySelector(`product-options[data-section="${this.dataset.section}"]`);
      if (!fresh) return;
      this.innerHTML = fresh.innerHTML;
      if (this.hasAttribute('data-update-url')) {
        const pageUrl = new URL(window.location.href);
        pageUrl.searchParams.set('variant', variantId);
        history.replaceState(history.state, '', pageUrl);
      }
      this.dispatchEvent(new CustomEvent('product-options:render', { bubbles: true }));
      if (focusId) document.getElementById(focusId)?.focus();
    } catch {
      // The pickers still show the choice; the shopper can try again or open the product page.
    } finally {
      this.removeAttribute('aria-busy');
    }
  }
}

if (!customElements.get('product-options')) customElements.define('product-options', ProductOptions);
