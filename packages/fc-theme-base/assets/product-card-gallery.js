/**
 * A product card's photos. The arrows step through them and the progress bar follows the photo in view, including
 * after a swipe on a touch screen.
 */
class ProductCardGallery extends HTMLElement {
  connectedCallback() {
    this.track = this.querySelector('.ui-product-card__track');
    this.segments = [...this.querySelectorAll('.ui-product-card__segment')];
    if (!this.track || this.segments.length < 2) return;

    this.index = 0;
    this.onClick = (event) => {
      const arrow = event.target.closest('.ui-product-card__arrow');
      if (!arrow) return;
      event.preventDefault();
      this.show(this.index + Number(arrow.dataset.step));
    };
    this.onScroll = () => {
      const index = Math.round(this.track.scrollLeft / this.track.clientWidth);
      // While an arrow's scroll is under way, the bar already shows where it is going.
      if (this.target !== undefined) {
        if (index === this.target) this.target = undefined;
        return;
      }
      this.mark(index);
    };
    this.addEventListener('click', this.onClick);
    this.track.addEventListener('scroll', this.onScroll, { passive: true });
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.onClick);
    this.track?.removeEventListener('scroll', this.onScroll);
  }

  show(index) {
    const count = this.segments.length;
    this.target = (index + count) % count;
    this.mark(this.target);
    const instant = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.track.scrollTo({ left: this.target * this.track.clientWidth, behavior: instant ? 'instant' : 'smooth' });
  }

  mark(index) {
    this.index = index;
    this.segments.forEach((segment, i) => segment.toggleAttribute('data-current', i === index));
  }
}

if (!customElements.get('product-card-gallery')) customElements.define('product-card-gallery', ProductCardGallery);
