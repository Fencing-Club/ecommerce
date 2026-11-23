// STOQ's storefront signup endpoint. It takes no key: the shop domain header names the store whose STOQ app gets the
// signup. https://docs.stoqapp.com/v1/back-in-stock/create-customer-intent-to-buy-product/
const SIGNUP_URL = 'https://app.stoqapp.com/api/v1/intents.json';

/**
 * `<product-restock>`: the back-in-stock form under a sold-out variant's buttons (`snippets/product-restock.liquid`).
 * It signs the email up with the store's STOQ app for that variant, then swaps the form for a thank-you line.
 */
class ProductRestock extends HTMLElement {
  connectedCallback() {
    this.form = this.querySelector('[data-restock-form]');
    this.message = this.querySelector('[data-restock-message]');
    this.form?.addEventListener('submit', this.onSubmit);
  }

  disconnectedCallback() {
    this.form?.removeEventListener('submit', this.onSubmit);
  }

  onSubmit = async (event) => {
    event.preventDefault();
    const input = this.form.querySelector('input[type="email"]');
    const button = this.form.querySelector('button[type="submit"]');
    if (button.getAttribute('aria-disabled') === 'true') return;
    if (!input.checkValidity()) return this.fail(this.dataset.invalidMessage, input);

    this.clear(input);
    button.setAttribute('aria-disabled', 'true');
    button.classList.add('loading');
    button.querySelector('.loading__spinner')?.classList.remove('hidden');
    try {
      const response = await fetch(SIGNUP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Shop-Domain': this.dataset.shop },
        body: JSON.stringify({
          intent: {
            shopify_variant_id: Number(this.dataset.variantId),
            shopify_product_id: Number(this.dataset.productId),
            channel: 'email',
            quantity: 1,
            source: 'api',
          },
          customer: { email: input.value.trim(), locale: document.documentElement.lang },
          product: { title: this.dataset.productTitle, variant_title: this.dataset.variantTitle },
        }),
      });
      const result = response.ok ? await response.json() : null;
      // A 200 can still carry errors, so the signup counts only once STOQ returns it.
      if (!result?.intents?.length) throw new Error('STOQ did not sign the email up.');
      this.form.remove();
      this.message.textContent = this.dataset.successMessage;
      this.message.classList.remove('product-restock__message--error');
    } catch {
      this.fail(this.dataset.errorMessage);
    } finally {
      button.classList.remove('loading');
      button.removeAttribute('aria-disabled');
      button.querySelector('.loading__spinner')?.classList.add('hidden');
    }
  };

  fail(text, input) {
    this.message.textContent = text;
    this.message.classList.add('product-restock__message--error');
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', this.message.id);
      input.focus();
    }
  }

  clear(input) {
    this.message.textContent = '';
    this.message.classList.remove('product-restock__message--error');
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  }
}

if (!customElements.get('product-restock')) customElements.define('product-restock', ProductRestock);
