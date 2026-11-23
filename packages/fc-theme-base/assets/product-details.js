const WIDE = window.matchMedia('(min-width: 750px)');

/**
 * `<product-details>`: the product page's details section (`sections/product-details.liquid`). On phones each part is
 * a row that opens in place. From 750px every part shows open as its own section, so its heading stops opening and
 * closing it and leaves the tab order. Show more questions reveals the questions after the first five, which a find in
 * page reveals too.
 */
class ProductDetails extends HTMLElement {
  connectedCallback() {
    this.addEventListener('click', this.onClick);
    this.addEventListener('beforematch', this.onBeforeMatch, true);
    WIDE.addEventListener('change', this.onLayout);
    this.onLayout();
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.onClick);
    this.removeEventListener('beforematch', this.onBeforeMatch, true);
    WIDE.removeEventListener('change', this.onLayout);
  }

  onLayout = () => {
    for (const part of this.querySelectorAll('.product-details__part')) {
      const summary = part.querySelector(':scope > summary');
      if (WIDE.matches) {
        part.open = true;
        summary?.setAttribute('tabindex', '-1');
      } else {
        summary?.removeAttribute('tabindex');
      }
    }
  };

  onClick = (event) => {
    if (!(event.target instanceof Element)) return;
    // Runs before motion.js's listener on the document, which leaves a click another script prevented alone.
    if (WIDE.matches && event.target.closest('.product-details__part > summary')) return event.preventDefault();
    const more = event.target.closest('[data-action="show-more-questions"]');
    if (more) this.showMoreQuestions(more);
  };

  onBeforeMatch = (event) => {
    // The browser shows the questions itself and scrolls to the match, so only the button goes.
    if (event.target instanceof Element && event.target.matches('[data-questions-more]')) {
      const button = event.target.nextElementSibling;
      if (button) button.hidden = true;
    }
  };

  // Moves focus to the first question it reveals, so a keyboard user carries on from there.
  showMoreQuestions(button) {
    const more = button.previousElementSibling;
    if (!more?.matches('[data-questions-more]')) return;
    more.hidden = false;
    button.hidden = true;
    more.querySelector('summary')?.focus();
  }
}

if (!customElements.get('product-details')) customElements.define('product-details', ProductDetails);
