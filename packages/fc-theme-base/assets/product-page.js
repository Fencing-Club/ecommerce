const DAY = 24 * 60 * 60 * 1000;

// The shop's clock as a Date whose UTC fields read the shop's local time, from an offset such as -0800.
const shopNow = (offset) => {
  const sign = offset.startsWith('-') ? -1 : 1;
  const minutes = sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(3, 5)));
  return new Date(Date.now() + minutes * 60 * 1000);
};

const isBusinessDay = (date) => date.getUTCDay() !== 0 && date.getUTCDay() !== 6;

const addBusinessDays = (date, days) => {
  let result = new Date(date);
  for (let left = days; left > 0; ) {
    result = new Date(result.getTime() + DAY);
    if (isBusinessDay(result)) left -= 1;
  }
  return result;
};

const pauseMedia = (root) => {
  for (const video of root.querySelectorAll('video')) video.pause();
  for (const frame of root.querySelectorAll('iframe')) {
    // YouTube and Vimeo both listen for a pause message; other players ignore it.
    frame.contentWindow?.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
    frame.contentWindow?.postMessage('{"method":"pause"}', '*');
  }
};

/**
 * `<product-page>`: the product page's top section (`sections/main-product.liquid`). It opens the photo viewer from the
 * gallery, brings a picked variant's photo to the front, opens Size guide's drawer, shows the buy bar once Add to cart
 * scrolls away and works out the ships line's countdown and dates. `product-options` swaps in fresh markup for each
 * variant, so whatever sits inside it is looked up again after each `product-options:render`.
 */
class ProductPage extends HTMLElement {
  connectedCallback() {
    this.buyRowVisible = true;
    this.buyRowAbove = false;
    this.observer = new IntersectionObserver(([entry]) => {
      this.buyRowVisible = entry.isIntersecting;
      this.buyRowAbove = entry.boundingClientRect.bottom < 0;
      this.showBar();
    });
    this.addEventListener('click', this.onClick);
    this.addEventListener('keydown', this.onKeyDown);
    this.addEventListener('product-options:variant', this.onVariant);
    this.addEventListener('product-options:render', this.onRender);
    for (const viewer of this.querySelectorAll('[data-photo-viewer]')) {
      viewer.addEventListener('photo-gallery:change', this.onViewerChange);
      viewer.addEventListener('close', this.onViewerClose);
    }
    this.refresh();
    this.timer = setInterval(() => this.updateDispatch(), 60 * 1000);
  }

  disconnectedCallback() {
    this.observer.disconnect();
    clearInterval(this.timer);
    this.removeEventListener('click', this.onClick);
    this.removeEventListener('keydown', this.onKeyDown);
    this.removeEventListener('product-options:variant', this.onVariant);
    this.removeEventListener('product-options:render', this.onRender);
    for (const viewer of this.querySelectorAll('[data-photo-viewer]')) {
      viewer.removeEventListener('photo-gallery:change', this.onViewerChange);
      viewer.removeEventListener('close', this.onViewerClose);
    }
  }

  refresh() {
    this.observer.disconnect();
    const row = this.querySelector('[data-product-add-row]');
    if (row) this.observer.observe(row);
    this.showBar();
    this.buildNav();
    this.updateDispatch();
  }

  onRender = () => {
    this.refresh();
    // Shopify draws the express checkout button on load; fresh markup needs it drawn again.
    window.Shopify?.PaymentButton?.init?.();
  };

  onClick = (event) => {
    if (!(event.target instanceof Element)) return;
    const photo = event.target.closest('[data-photo-open]');
    if (photo) return this.openViewer(photo);
    if (event.target.closest('[data-photo-viewer-close]')) return event.target.closest('dialog')?.close();
    if (event.target.closest('[data-product-sticky-choose]')) return this.chooseSize();
    const guide = event.target.closest('a[aria-haspopup="dialog"][aria-controls]');
    if (!guide || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    // The size chart's dialog sits in a ui-drawer, which opens it and puts focus back on the link when it closes.
    const drawer = document.getElementById(guide.getAttribute('aria-controls'))?.closest('ui-drawer');
    if (drawer?.show(guide)) event.preventDefault();
  };

  onKeyDown = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const viewer = event.target.closest('[data-photo-viewer]');
    // Video controls and embedded players use the arrow keys themselves.
    if (!viewer || event.target.closest('video, iframe')) return;
    const gallery = viewer.querySelector('photo-gallery');
    event.preventDefault();
    gallery?.show(gallery.current + (event.key === 'ArrowRight' ? 1 : -1));
  };

  openViewer(opener) {
    const viewer = document.getElementById(opener.getAttribute('aria-controls') ?? '');
    if (!(viewer instanceof HTMLDialogElement) || viewer.open) return;
    this.viewerOpener = opener;
    viewer.showModal();
    viewer.querySelector('photo-gallery')?.show(Number(opener.dataset.photoOpen ?? 0), 'instant');
    viewer.querySelector('[data-photo-viewer-close]')?.focus();
  }

  onViewerChange = (event) => pauseMedia(event.currentTarget);

  onViewerClose = (event) => {
    pauseMedia(event.currentTarget);
    this.viewerOpener?.focus();
  };

  // The buy bar's Choose a size goes back to the size picker.
  chooseSize() {
    const pickers = [...this.querySelectorAll('fieldset[data-option-position]')];
    const unpicked = pickers.find((fieldset) => !fieldset.querySelector('input:checked')) ?? pickers.at(-1);
    if (!unpicked) return;
    unpicked.scrollIntoView({ behavior: 'smooth', block: 'center' });
    unpicked.querySelector('input')?.focus({ preventScroll: true });
  }

  onVariant = (event) => {
    const gallery = this.querySelector('[data-product-gallery]');
    const track = gallery?.querySelector('[data-photo-track]');
    const item = track?.querySelector(`[data-media-id="${event.detail?.variant?.media}"]`);
    if (!gallery || !item) return;
    if (item !== track.firstElementChild) track.prepend(item);
    gallery.show(0);
    gallery.mark();
  };

  showBar() {
    const bar = this.querySelector('[data-product-sticky]');
    if (!bar) return;
    const visible = !this.buyRowVisible && this.buyRowAbove;
    bar.inert = !visible;
    bar.toggleAttribute('data-visible', visible);
  }

  // Links to the page's sections, such as Overview and Reviews, named by each one's data-product-section.
  buildNav() {
    const nav = this.querySelector('[data-product-sticky-nav]');
    const targets = [...document.querySelectorAll('[data-product-section][id]')];
    if (!nav || targets.length === 0) return;
    nav.replaceChildren(
      ...targets.map((target) => {
        const link = document.createElement('a');
        link.className = 'product-sticky__link';
        link.href = `#${target.id}`;
        link.textContent = target.dataset.productSection;
        return link;
      }),
    );
    nav.hidden = false;
  }

  // Woodinville stock ships the same business day before the cutoff; partner stock a set number of business days later.
  updateDispatch() {
    const line = this.querySelector('[data-dispatch]');
    const text = line?.querySelector('[data-dispatch-text]');
    if (!line || !text) return;
    const data = line.dataset;
    const locale = document.documentElement.lang || undefined;
    const formatDay = (date, format) => new Intl.DateTimeFormat(locale, { ...format, timeZone: 'UTC' }).format(date);
    const now = shopNow(data.offset ?? '+0000');
    const cutoff = Number(data.cutoff);
    const beforeCutoff = isBusinessDay(now) && now.getUTCHours() < cutoff;
    const firstDay = beforeCutoff ? now : addBusinessDays(now, 1);
    let ships = data.partnerText;
    let shipStart = firstDay;
    let shipEnd = firstDay;
    if (data.dispatch === 'local' && beforeCutoff) {
      const left = Math.max(1, cutoff * 60 - (now.getUTCHours() * 60 + now.getUTCMinutes()));
      const hours = Math.floor(left / 60);
      const minutes = String(left % 60);
      const time = hours > 0 ? data.time.replace('[hours]', String(hours)).replace('[minutes]', minutes) : data.minutes.replace('[minutes]', minutes);
      ships = data.countdown.replace('[time]', time);
    } else if (data.dispatch === 'local') {
      const tomorrow = new Date(now.getTime() + DAY).getUTCDate() === firstDay.getUTCDate();
      ships = data.shipsOn.replace('[day]', tomorrow ? data.tomorrow : formatDay(firstDay, { weekday: 'long' }));
    } else {
      const [partnerMin, partnerMax] = (data.partner ?? '').split(',').map(Number);
      shipStart = addBusinessDays(firstDay, partnerMin);
      shipEnd = addBusinessDays(firstDay, partnerMax);
    }
    const [transitMin, transitMax] = (data.transit ?? '').split(',').map(Number);
    let arrives = '';
    if (data.arrives && transitMin && transitMax) {
      const format = { month: 'short', day: 'numeric' };
      arrives = data.arrives
        .replace('[start]', formatDay(addBusinessDays(shipStart, transitMin), format))
        .replace('[end]', formatDay(addBusinessDays(shipEnd, transitMax), format));
    }
    text.textContent = arrives ? `${ships} ${arrives}` : ships;
  }
}

if (!customElements.get('product-page')) customElements.define('product-page', ProductPage);
