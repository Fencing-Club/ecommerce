// A dismissible notice. Its dismiss button removes it and fires notice:dismiss, which bubbles, so callers can remember it.
if (!customElements.get('ui-notice')) {
  customElements.define(
    'ui-notice',
    class extends HTMLElement {
      connectedCallback() {
        if (this.ready) return;
        this.ready = true;
        this.addEventListener('click', (event) => {
          if (!event.target.closest('[data-notice-dismiss]')) return;
          this.dispatchEvent(new CustomEvent('notice:dismiss', { bubbles: true }));
          this.remove();
        });
      }
    },
  );
}
