/**
 * A product card's photos. The arrows step through them and the progress bar follows the photo in view, including
 * after a swipe on a touch screen. A color button under the photo shows that color's photo, by moving to it when it's
 * one of the card's photos or by putting it first when it isn't, and points the card's links at that color.
 */
class ProductCardGallery extends HTMLElement {
  connectedCallback() {
    this.track = this.querySelector('.ui-product-card__track');
    this.segments = [...this.querySelectorAll('.ui-product-card__segment')];
    this.card = this.closest('.ui-product-card');
    this.index = 0;

    this.onSwatch = (event) => {
      const swatch = event.target.closest('[data-card-swatch]');
      if (swatch && this.card.contains(swatch)) this.showColor(swatch);
    };
    this.card?.addEventListener('click', this.onSwatch);

    if (!this.track || this.segments.length < 2) return;
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
    this.card?.removeEventListener('click', this.onSwatch);
    if (this.onClick) this.removeEventListener('click', this.onClick);
    if (this.onScroll) this.track?.removeEventListener('scroll', this.onScroll);
  }

  show(index) {
    const count = this.segments.length;
    if (count < 2) return;
    this.target = (index + count) % count;
    this.mark(this.target);
    const instant = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.track.scrollTo({ left: this.target * this.track.clientWidth, behavior: instant ? 'instant' : 'smooth' });
  }

  mark(index) {
    this.index = index;
    this.segments.forEach((segment, i) => segment.toggleAttribute('data-current', i === index));
  }

  showColor(swatch) {
    for (const other of this.card.querySelectorAll('[data-card-swatch]')) {
      other.setAttribute('aria-pressed', String(other === swatch));
    }
    if (swatch.dataset.url) {
      for (const link of this.card.querySelectorAll('.ui-product-card__track, .ui-product-card__link')) {
        link.href = swatch.dataset.url;
      }
    }
    if (swatch.dataset.photoIndex !== undefined) {
      this.show(Number(swatch.dataset.photoIndex));
      return;
    }
    const image = this.track?.querySelector('.ui-product-card__image');
    if (!image || !swatch.dataset.photoSrc) return;
    image.srcset = swatch.dataset.photoSrcset;
    image.src = swatch.dataset.photoSrc;
    image.alt = swatch.dataset.photoAlt;
    this.show(0);
  }
}

if (!customElements.get('product-card-gallery')) customElements.define('product-card-gallery', ProductCardGallery);
