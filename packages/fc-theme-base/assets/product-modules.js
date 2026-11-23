/**
 * The buy box's modules under Add to cart (`snippets/product-kit.liquid`, `snippets/product-add-ons.liquid`). Each
 * keeps its button's count and total current as extras are ticked or changed. `product-form.js` reads the ticked
 * extras, the checkboxes marked `data-extra`, when the form is sent.
 */

/** Formats cents in the cart's currency, as Liquid's `money` filter does for the store's default format. */
const money = (cents, currency) =>
  new Intl.NumberFormat(document.documentElement.lang || undefined, { style: 'currency', currency }).format(cents / 100);

/** How many of this product the buy row's form is set to add. */
const quantityOf = (form) => Math.max(1, Number.parseInt(form?.elements.quantity?.value ?? '1', 10) || 1);

/** `<product-kit>`: Complete the kit. A piece's picker sets the variant its checkbox adds and the price it shows. */
class ProductKit extends HTMLElement {
  connectedCallback() {
    this.form = document.getElementById(this.dataset.form);
    this.addEventListener('change', this.onChange);
    this.form?.addEventListener('change', this.update);
    this.update();
  }

  disconnectedCallback() {
    this.removeEventListener('change', this.onChange);
    this.form?.removeEventListener('change', this.update);
  }

  onChange = (event) => {
    const select = event.target.closest('select');
    const row = event.target.closest('[data-kit-row]');
    if (select && row) {
      const option = select.selectedOptions[0];
      const piece = row.querySelector('[data-extra]');
      piece.value = option.value;
      piece.dataset.price = option.dataset.price;
      row.querySelector('[data-kit-price]').textContent = money(Number(option.dataset.price), this.dataset.currency);
    }
    this.update();
  };

  update = () => {
    const quantity = quantityOf(this.form);
    const pieces = [...this.querySelectorAll('[data-extra]:checked')];
    const total = pieces.reduce((sum, piece) => sum + Number(piece.dataset.price), Number(this.dataset.price) * quantity);
    const label = this.querySelector('.product-kit__add .ui-button__label');
    if (!label) return;
    label.textContent = this.dataset.label
      .replace('[count]', String(quantity + pieces.length))
      .replace('[total]', money(total, this.dataset.currency));
  };
}

/** `<product-add-ons>`: Add to your order. Ticked extras add their total to the form's Add to cart button. */
class ProductAddOns extends HTMLElement {
  connectedCallback() {
    this.form = this.closest('form');
    this.form?.addEventListener('change', this.update);
    this.update();
  }

  disconnectedCallback() {
    this.form?.removeEventListener('change', this.update);
  }

  update = () => {
    const label = this.form?.querySelector('button[name="add"] .ui-button__label');
    if (!label) return;
    this.plain ??= label.textContent;
    const extras = [...this.querySelectorAll('[data-extra]:checked')];
    if (extras.length === 0) {
      label.textContent = this.plain;
      return;
    }
    const total = extras.reduce((sum, extra) => sum + Number(extra.dataset.price), Number(this.dataset.price) * quantityOf(this.form));
    label.textContent = this.dataset.label.replace('[total]', money(total, this.dataset.currency));
  };
}

if (!customElements.get('product-kit')) customElements.define('product-kit', ProductKit);
if (!customElements.get('product-add-ons')) customElements.define('product-add-ons', ProductAddOns);
