/*
 * Discount code, order note, gift choices and the phone checkout bar. Each view has its own copy; saves update the others.
 */
const cartViews = () => [...document.querySelectorAll('cart-items, cart-drawer-items')];
const refreshCartViews = () => Promise.all(cartViews().map(view => view.onCartUpdate()));
const cartController = () => customElements.get('cart-items');

const setFeedback = (element, message, tone = 'error') => {
  if (!element) return;
  element.dataset.tone = tone;
  element.querySelector('.fc-feedback__text').textContent = message;
  element.hidden = !message;
};

if (!customElements.get('cart-extras')) {
  customElements.define(
    'cart-extras',
    class CartExtras extends HTMLElement {
      connectedCallback() {
        if (this.initialized) return;
        this.initialized = true;
        this.addEventListener('click', event => {
          const opener = event.target.closest('[data-open-editor]');
          if (opener) this.open(opener.dataset.openEditor);
          else if (event.target.closest('[data-edit-note]')) this.open('note');
          else if (event.target.closest('[data-close-editor]')) this.close();
        });
        this.addEventListener('keydown', event => {
          if (event.key === 'Escape' && this.dataset.open === 'discount' && !this.querySelector('cart-discount')?.busy) {
            event.preventDefault();
            this.close();
          }
        });
      }

      open(kind) {
        this.dataset.open = kind;
        this.syncButtons();
        const field = kind === 'discount' ? this.querySelector('cart-discount input') : this.querySelector('cart-note textarea');
        field?.focus();
        // Editing a saved note continues it, so the cursor starts at the end.
        if (kind === 'note' && field) field.setSelectionRange(field.value.length, field.value.length);
      }

      /** Closes the open editor and returns focus to the control that opened it. */
      close({ focus = true } = {}) {
        const kind = this.dataset.open;
        delete this.dataset.open;
        this.syncButtons();
        if (!focus) return;
        const target = kind === 'note' && this.hasAttribute('data-has-note') ? this.querySelector('[data-edit-note]') : this.querySelector(`[data-open-editor="${kind}"]`);
        (target?.offsetParent ? target : this.querySelector('[data-open-editor]'))?.focus({ preventScroll: true });
      }

      syncButtons() {
        this.querySelectorAll('[data-open-editor], [data-edit-note]').forEach(button => {
          const kind = button.dataset.openEditor || 'note';
          button.setAttribute('aria-expanded', String(this.dataset.open === kind));
        });
      }
    }
  );
}

if (!customElements.get('cart-note')) {
  customElements.define(
    'cart-note',
    class CartNote extends HTMLElement {
      connectedCallback() {
        if (this.initialized) return;
        this.initialized = true;
        this.addEventListener('input', () => {
          this.updateCount();
          setFeedback(this.feedback, '');
          cartController()?.updateCheckoutState();
        });
        this.addEventListener('click', event => {
          if (event.target.closest('[data-save-note]')) this.save();
          else if (event.target.closest('[data-cancel-note]')) this.cancel();
        });
        this.updateCount();
      }

      get textarea() {
        return this.querySelector('textarea');
      }

      get feedback() {
        return this.querySelector('.fc-feedback');
      }

      get savedNote() {
        return this.dataset.savedNote || '';
      }

      /** The note differs from the one Shopify has. Line endings are compared loosely. */
      get isDirty() {
        const value = this.textarea?.value ?? '';
        return value.replace(/\r\n/g, '\n') !== this.savedNote.replace(/\r\n/g, '\n');
      }

      updateCount() {
        const count = this.querySelector('[data-note-count]');
        if (count && this.dataset.count) count.textContent = this.dataset.count.replace('[count]', this.textarea.value.length);
      }

      /** Opens the editor so the shopper can save or clear the note. */
      reveal() {
        const extras = this.closest('cart-extras');
        if (extras?.dataset.open !== 'note') extras?.open('note');
        this.querySelector('[data-save-note]')?.focus();
      }

      /** Closes the editor and puts back the saved note, dropping unsaved changes. */
      cancel() {
        if (this.saving) return;
        this.textarea.value = this.savedNote;
        this.updateCount();
        setFeedback(this.feedback, '');
        this.closest('cart-extras')?.close();
        cartController()?.updateCheckoutState();
      }

      setSaving(saving) {
        const button = this.querySelector('[data-save-note]');
        const cancel = this.querySelector('[data-cancel-note]');
        if (cancel) cancel.disabled = saving;
        this.toggleAttribute('data-saving', saving);
        button.disabled = saving;
        button.toggleAttribute('aria-busy', saving);
        button.textContent = saving ? this.dataset.saving : this.dataset.save;
      }

      /** Applies a saved note to this copy unless the shopper is editing it. */
      applySaved(note, { force = false } = {}) {
        if (!force && this.isDirty) return;
        this.dataset.savedNote = note;
        this.textarea.value = note;
        this.querySelector('[data-note-text]').textContent = note;
        this.updateCount();
        const extras = this.closest('cart-extras');
        extras?.toggleAttribute('data-has-note', note !== '');
      }

      async save() {
        if (this.saving) return;
        this.saving = true;
        const note = this.textarea.value;
        const deferred = this.dispatchNoteUpdateEvent(note);
        setFeedback(this.feedback, '');
        this.setSaving(true);
        const extras = this.closest('cart-extras');
        try {
          await cartController().mutate(async () => {
            const response = await fetch(routes.cart_update_url, { ...fetchConfig(), body: JSON.stringify({ note }) });
            const cart = await response.json();
            if (!response.ok || cart.errors || (cart.note || '') !== note) throw new Error(this.dataset.error);
            const { CartNoteUpdateEvent } = window.StandardEvents || {};
            if (CartNoteUpdateEvent) deferred?.resolve({ cart: CartNoteUpdateEvent.createCartFromAjaxResponse(cart) });
          });
          document.querySelectorAll('cart-note').forEach(element => element.applySaved(note, { force: element === this }));
          extras?.close();
        } catch (error) {
          setFeedback(this.feedback, this.dataset.error);
          deferred?.reject(error);
        } finally {
          this.saving = false;
          this.setSaving(false);
          cartController()?.updateCheckoutState();
        }
      }

      dispatchNoteUpdateEvent(note) {
        const { CartNoteUpdateEvent } = window.StandardEvents || {};
        if (!CartNoteUpdateEvent) return null;
        const deferred = CartNoteUpdateEvent.createPromise();
        this.dispatchEvent(new CartNoteUpdateEvent({ context: this.closest('cart-drawer') ? 'dialog' : 'cart', note, promise: deferred.promise }));
        return deferred;
      }
    }
  );
}

if (!customElements.get('cart-discount')) {
  class CartDiscount extends HTMLElement {
    connectedCallback() {
      if (this.initialized) return;
      this.initialized = true;
      this.addEventListener('click', event => {
        if (event.target.closest('[data-apply-discount]')) this.apply();
      });
      this.addEventListener('keydown', event => {
        if (event.key === 'Enter' && event.target.matches('input')) {
          event.preventDefault();
          this.apply();
        }
      });
      this.addEventListener('input', () => {
        if (this.dataset.state === 'invalid') this.setState('');
        setFeedback(this.feedback, '');
      });
    }

    get input() {
      return this.querySelector('input');
    }

    get feedback() {
      return this.querySelector('.fc-feedback');
    }

    setState(state) {
      if (state) this.dataset.state = state;
      else delete this.dataset.state;
      const button = this.querySelector('[data-apply-discount]');
      const applying = state === 'applying';
      button.disabled = applying;
      button.toggleAttribute('aria-busy', applying);
      button.textContent = applying ? this.dataset.applying : this.dataset.apply;
      if (state === 'invalid') this.input.setAttribute('aria-invalid', 'true');
      else this.input.removeAttribute('aria-invalid');
    }

    /** Applicable codes on the cart right now. */
    static async currentCodes() {
      const response = await fetch(`${routes.cart_url}.js`);
      if (!response.ok) throw new Error('Cart unavailable');
      const cart = await response.json();
      return (cart.discount_codes || []).filter(entry => entry.applicable).map(entry => entry.code);
    }

    static async submitCodes(codes) {
      const response = await fetch(routes.cart_update_url, { ...fetchConfig(), body: JSON.stringify({ discount: codes.join(',') }) });
      const cart = await response.json();
      if (!response.ok || cart.errors) throw new Error('Discount update failed');
      return cart;
    }

    async apply() {
      if (this.busy) return;
      const code = this.input.value.trim();
      if (!code) {
        this.input.focus();
        return;
      }
      this.busy = true;
      setFeedback(this.feedback, '');
      this.setState('applying');
      let applied = false;
      try {
        await cartController().mutate(async () => {
          const codes = await CartDiscount.currentCodes();
          if (!codes.some(value => value.toLowerCase() === code.toLowerCase())) codes.push(code);
          const cart = await CartDiscount.submitCodes(codes);
          applied = (cart.discount_codes || []).some(entry => entry.applicable && entry.code.toLowerCase() === code.toLowerCase());
          if (applied) await refreshCartViews();
        });
        if (applied) {
          this.setState('');
          this.input.value = '';
          this.closest('cart-extras')?.close();
        } else {
          this.setState('invalid');
          setFeedback(this.feedback, this.dataset.invalid.replace('[code]', code));
          this.input.focus();
        }
      } catch {
        this.setState('');
        setFeedback(this.feedback, this.dataset.error);
      } finally {
        this.busy = false;
      }
    }

    /** Removes one code and keeps the others. A failure shows under the summary rows. */
    static async remove(code, chip) {
      const summary = chip.closest('[data-cart-summary]');
      const feedback = summary?.querySelector('[data-discount-feedback] .fc-feedback');
      const template = summary?.querySelector('cart-discount')?.dataset.removeError || '';
      chip.querySelector('button')?.setAttribute('disabled', '');
      setFeedback(feedback, '');
      try {
        await cartController().mutate(async () => {
          const codes = await CartDiscount.currentCodes();
          await CartDiscount.submitCodes(codes.filter(value => value.toLowerCase() !== code.toLowerCase()));
          await refreshCartViews();
        });
        summary?.querySelector('[data-open-editor="discount"]')?.focus({ preventScroll: true });
      } catch {
        chip.querySelector('button')?.removeAttribute('disabled');
        setFeedback(feedback, template.replace('[code]', code));
      }
    }

    /** Shows applied codes that have no amount in the cart, such as free shipping codes, on the Shipping row, which then reads Free. */
    static async syncShippingCodes() {
      const cart = await cartController()?.fetchCartData();
      if (!cart) return;
      const codes = (cart.discount_codes || []).filter(entry => entry.applicable).map(entry => entry.code);
      document.querySelectorAll('[data-cart-summary]').forEach(summary => {
        const slot = summary.querySelector('[data-shipping-codes]');
        const template = summary.querySelector('template[data-chip-template]');
        if (!slot || !template) return;
        const shown = new Set([...summary.querySelectorAll('[data-cart-region="breakdown"] [data-discount-chip]')].filter(chip => !slot.contains(chip)).map(chip => chip.dataset.discountChip.toLowerCase()));
        const shippingCodes = codes.filter(code => !shown.has(code.toLowerCase()));
        const view = summary.closest('cart-drawer, cart-items') || summary;
        view.querySelectorAll('[data-shipping-row]').forEach(row => row.toggleAttribute('data-code-free', shippingCodes.length > 0));
        slot.replaceChildren(
          ...shippingCodes.map(code => {
              const chip = template.content.firstElementChild.cloneNode(true);
              chip.dataset.discountChip = code;
              chip.querySelector('.fc-chip__label').textContent = code;
              const button = chip.querySelector('[data-remove-code]');
              button.dataset.removeCode = code;
              button.setAttribute('aria-label', button.getAttribute('aria-label').replace('[code]', code));
              return chip;
            })
        );
      });
    }
  }
  customElements.define('cart-discount', CartDiscount);

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-code]');
    if (!button) return;
    CartDiscount.remove(button.dataset.removeCode, button.closest('[data-discount-chip]'));
  });
  document.addEventListener('DOMContentLoaded', () => CartDiscount.syncShippingCodes());
}

if (!customElements.get('cart-checkout-bar')) {
  customElements.define(
    'cart-checkout-bar',
    class CartCheckoutBar extends HTMLElement {
      connectedCallback() {
        if (this.initialized) return;
        this.initialized = true;
        this.addEventListener('click', event => {
          if (event.target.closest('[data-toggle-breakdown]')) this.toggle(!this.hasAttribute('data-open'));
          else if (event.target.closest('[data-close-breakdown]')) this.toggle(false);
        });
        this.addEventListener('keyup', event => {
          if (event.key === 'Escape' && this.hasAttribute('data-open')) {
            event.preventDefault();
            event.stopPropagation();
            this.toggle(false);
          }
        });
        const view = this.closest('cart-drawer, cart-items');
        view?.addEventListener('cart:regions-updated', () => this.sync());
        // A tap on the dimmed cart behind the open breakdown closes it.
        view?.addEventListener('click', event => {
          if (this.hasAttribute('data-open') && !this.contains(event.target) && !event.target.closest('.fc-flyout__header')) this.toggle(false);
        });
      }

      toggle(open) {
        this.toggleAttribute('data-open', open);
        this.sync();
        if (open) this.querySelector('[data-close-breakdown]')?.focus();
        else this.querySelector('[data-toggle-breakdown]')?.focus();
      }

      sync() {
        const open = this.hasAttribute('data-open');
        this.querySelector('.fc-bar__breakdown').hidden = !open;
        this.querySelector('[data-toggle-breakdown]')?.setAttribute('aria-expanded', String(open));
      }
    }
  );
}

if (!customElements.get('cart-gift-options')) {
  customElements.define(
    'cart-gift-options',
    class CartGiftOptions extends HTMLElement {
      connectedCallback() {
        if (this.initialized) return;
        this.initialized = true;
        this.addEventListener('change', event => {
          if (event.target.matches('.fc-gift__input')) this.choose(event.target);
        });
      }

      get feedback() {
        return this.querySelector('.fc-feedback');
      }

      setBusy(busy) {
        this.toggleAttribute('aria-busy', busy);
        this.querySelectorAll('.fc-gift__input').forEach(input => {
          input.disabled = busy || Boolean(input.closest('[data-unavailable]'));
        });
      }

      /** Saves the choice as the tier's cart attribute right away. A failure puts the previous choice back. */
      async choose(input) {
        const key = this.dataset.giftKey;
        const { value } = input;
        // The checked attribute is the saved choice from the last render; clicking only changes the property.
        const previous = this.querySelector('.fc-gift__input[checked]')?.value || '';
        const view = this.closest('cart-drawer, cart-items');
        const inLine = Boolean(this.closest('[data-gift-line]'));
        setFeedback(this.feedback, '');
        this.setBusy(true);
        try {
          await cartController().mutate(async () => {
            const response = await fetch(routes.cart_update_url, { ...fetchConfig(), body: JSON.stringify({ attributes: { [key]: value } }) });
            const cart = await response.json();
            if (!response.ok || cart.errors || cart.attributes?.[key] !== value) throw new Error('Gift update failed');
            await refreshCartViews();
          });
          // A panel turns into a gift line, so focus follows the gift.
          const line = [...(view?.querySelectorAll('[data-gift-line]') || [])].find(row => row.dataset.giftKey === key);
          (inLine ? line?.querySelector('.fc-gift__input:checked') : line?.querySelector('summary'))?.focus({ preventScroll: true });
        } catch {
          this.setBusy(false);
          this.querySelectorAll('.fc-gift__input').forEach(radio => {
            radio.checked = radio.value === previous;
          });
          const template = previous ? this.dataset.changeError : this.dataset.addError;
          setFeedback(this.feedback, (template || '').replace('[gift]', input.dataset.giftName || value));
        }
      }
    }
  );
}

if (!customElements.get('cart-gift-sync')) {
  const clearing = new Set();
  customElements.define(
    'cart-gift-sync',
    /** Clears gift choices the cart no longer qualifies for. The gift removed notice stays until the next change. */
    class CartGiftSync extends HTMLElement {
      connectedCallback() {
        let keys = [];
        try {
          keys = JSON.parse(this.dataset.clear || '[]');
        } catch {}
        keys = keys.filter(key => !clearing.has(key));
        if (!keys.length || !cartController()) return;
        keys.forEach(key => clearing.add(key));
        const attributes = Object.fromEntries(keys.map(key => [key, '']));
        cartController()
          .mutate(async () => {
            const response = await fetch(routes.cart_update_url, { ...fetchConfig(), body: JSON.stringify({ attributes }) });
            if (!response.ok) throw new Error('Gift cleanup failed');
          })
          .catch(() => {})
          .finally(() => keys.forEach(key => clearing.delete(key)));
      }
    }
  );
}
