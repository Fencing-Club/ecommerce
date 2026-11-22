/**
 * `<photo-gallery>`: photos in a sideways track (`[data-photo-track]`) that snaps to each one. Arrows
 * (`[data-photo-step]`), thumbnails and dots (`[data-photo-index]`) move between them. The counter
 * (`[data-photo-counter]`, its `data-template` holding `[index]`) and the current thumbnail or dot follow the track as
 * it scrolls, swipes included. `show(index)` moves to a photo and `showMedia(id)` to the photo with that
 * `data-media-id`, as when a variant is picked. Quick view's photos use it.
 */
class PhotoGallery extends HTMLElement {
  connectedCallback() {
    this.track = this.querySelector('[data-photo-track]');
    this.addEventListener('click', this.onClick);
    this.track?.addEventListener('scroll', this.onScroll, { passive: true });
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.onClick);
    this.track?.removeEventListener('scroll', this.onScroll);
  }

  get slides() {
    return [...(this.track?.children ?? [])];
  }

  get current() {
    return Number(this.dataset.currentPhoto ?? 0);
  }

  /** The scroll position that brings a slide to the start of the track. */
  offsetOf(slide) {
    return slide.offsetLeft - (this.slides[0]?.offsetLeft ?? 0);
  }

  show(index, behavior = 'smooth') {
    const slides = this.slides;
    if (!this.track || slides.length === 0) return;
    const target = slides[Math.max(0, Math.min(slides.length - 1, index))];
    this.track.scrollTo({ left: this.offsetOf(target), behavior });
    // A jump doesn't always fire a scroll event, so mark the photo straight away too.
    if (behavior === 'instant') this.mark();
  }

  showMedia(mediaId, behavior) {
    const index = this.slides.findIndex((slide) => slide.dataset.mediaId === String(mediaId));
    if (index >= 0) this.show(index, behavior);
  }

  mark() {
    const slides = this.slides;
    if (!this.track || slides.length === 0 || this.track.clientWidth === 0) return;
    let index = 0;
    let nearest = Infinity;
    slides.forEach((slide, position) => {
      const distance = Math.abs(this.offsetOf(slide) - this.track.scrollLeft);
      if (distance < nearest) {
        nearest = distance;
        index = position;
      }
    });
    if (String(index) === this.dataset.currentPhoto) return;
    this.dataset.currentPhoto = String(index);
    const counter = this.querySelector('[data-photo-counter]');
    if (counter) counter.textContent = counter.dataset.template.replace('[index]', String(index + 1));
    for (const item of this.querySelectorAll('[data-photo-index]')) {
      if (Number(item.dataset.photoIndex) === index) item.setAttribute('aria-current', 'true');
      else item.removeAttribute('aria-current');
    }
    this.dispatchEvent(new CustomEvent('photo-gallery:change', { bubbles: true, detail: { index } }));
  }

  onScroll = () => {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.mark());
  };

  onClick = (event) => {
    const item = event.target.closest('[data-photo-index]');
    if (item && this.contains(item)) this.show(Number(item.dataset.photoIndex));
    const arrow = event.target.closest('[data-photo-step]');
    if (arrow && this.contains(arrow)) this.show(this.current + Number(arrow.dataset.photoStep));
  };
}

if (!customElements.get('photo-gallery')) customElements.define('photo-gallery', PhotoGallery);
