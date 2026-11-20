// A modal dialog. Buttons with data-dialog-open open the dialog their aria-controls names; data-dialog-close buttons,
// Escape and a click on the backdrop close it, and focus returns to the opener.
if (!customElements.get('ui-dialog')) {
  customElements.define(
    'ui-dialog',
    class extends HTMLElement {
      connectedCallback() {
        if (this.dialog) return;
        this.dialog = this.querySelector(':scope > dialog');
        if (!this.dialog) return;
        this.addEventListener('click', (event) => {
          const opener = event.target.closest('[data-dialog-open]');
          if (opener && opener.getAttribute('aria-controls') === this.dialog.id) {
            event.preventDefault();
            this.show(opener);
          } else if (event.target.closest('[data-dialog-close]')) {
            event.preventDefault();
            this.hide();
          } else if (event.target === this.dialog) {
            // A click on the dialog element itself, not its content, is a click on the backdrop.
            this.hide();
          }
        });
        // Close on Escape here as well as through the native cancel event, as ui-drawer does, so scripted keys work too.
        this.dialog.addEventListener('keydown', (event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          this.hide();
        });
        this.dialog.addEventListener('close', () => {
          this.opener?.setAttribute('aria-expanded', 'false');
          this.opener?.focus();
          this.opener = null;
        });
      }

      show(opener) {
        this.opener = opener;
        opener?.setAttribute('aria-expanded', 'true');
        this.dialog.showModal();
      }

      hide() {
        if (this.dialog.open) this.dialog.close();
      }
    },
  );
}
