/**
 * Quick view: a product card's `[data-quick-view]` button opens the page's quick view dialog with that product's
 * `product-quick-view` section. Arrows, thumbnails and swipes move between photos, picking a variant shows its photo,
 * and adding to the cart closes the dialog so the cart can open. Size guide swaps the options for the size chart until
 * Back or Escape. A request that fails offers the product page.
 */
const sectionId = 'product-quick-view';

function showPhoto(gallery, index) {
  const track = gallery.querySelector('[data-photo-track]');
  if (!track) return;
  const count = track.children.length;
  const target = Math.max(0, Math.min(count - 1, index));
  track.scrollTo({ left: target * track.clientWidth, behavior: 'smooth' });
}

function markPhoto(gallery) {
  const track = gallery.querySelector('[data-photo-track]');
  if (!track || track.clientWidth === 0) return;
  const index = Math.round(track.scrollLeft / track.clientWidth);
  gallery.dataset.currentPhoto = String(index);
  const counter = gallery.querySelector('[data-photo-counter]');
  if (counter) counter.textContent = counter.dataset.template.replace('[index]', String(index + 1));
  for (const thumb of gallery.querySelectorAll('[data-photo-index]')) {
    if (Number(thumb.dataset.photoIndex) === index) thumb.setAttribute('aria-current', 'true');
    else thumb.removeAttribute('aria-current');
  }
}

function showSizeGuide(content, open) {
  const panel = content.querySelector('[data-size-guide]');
  if (!panel) return;
  panel.closest('.quick-view__details').toggleAttribute('data-showing-size-guide', open);
  panel.hidden = !open;
  // Picking a variant re-renders the options, so the opener is found again each time.
  const opener = content.querySelector('[data-size-guide-open]');
  opener?.setAttribute('aria-expanded', String(open));
  if (open) panel.querySelector('[tabindex="-1"]')?.focus();
  else opener?.focus();
}

function watchSizeGuide(content) {
  content.addEventListener('click', (event) => {
    if (event.target.closest('[data-size-guide-open]')) {
      event.preventDefault();
      showSizeGuide(content, true);
    } else if (event.target.closest('[data-size-guide-close]')) {
      showSizeGuide(content, false);
    }
  });
}

function watchGallery(content) {
  const gallery = content.querySelector('[data-quick-view-gallery]');
  if (!gallery) return;
  const track = gallery.querySelector('[data-photo-track]');
  let frame = 0;
  track?.addEventListener('scroll', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => markPhoto(gallery));
  });
  gallery.addEventListener('click', (event) => {
    const thumb = event.target.closest('[data-photo-index]');
    if (thumb) showPhoto(gallery, Number(thumb.dataset.photoIndex));
    const arrow = event.target.closest('[data-photo-step]');
    if (arrow) showPhoto(gallery, Number(gallery.dataset.currentPhoto ?? 0) + Number(arrow.dataset.photoStep));
  });
  content.addEventListener('product-options:variant', (event) => {
    const mediaId = event.detail.variant.media;
    if (!mediaId || !track) return;
    const index = [...track.children].findIndex((slide) => slide.dataset.mediaId === String(mediaId));
    if (index >= 0) showPhoto(gallery, index);
  });
}

async function open(dialog, url) {
  setUpDialog(dialog);
  const body = dialog.querySelector('[data-quick-view-body]');
  body.replaceChildren(dialog.querySelector('[data-quick-view-loading]').content.cloneNode(true));
  dialog.removeAttribute('aria-labelledby');
  if (!dialog.open) dialog.showModal();
  try {
    const address = new URL(url, window.location.origin);
    address.searchParams.set('section_id', sectionId);
    const response = await fetch(address);
    if (!response.ok) throw new Error(`Quick view failed with ${response.status}`);
    const page = new DOMParser().parseFromString(await response.text(), 'text/html');
    const content = page.querySelector('[data-quick-view-content]');
    if (!content) throw new Error('Quick view returned no product');
    body.replaceChildren(document.adoptNode(content));
    dialog.setAttribute('aria-labelledby', content.dataset.titleId);
    watchGallery(content);
    watchSizeGuide(content);
  } catch {
    const failed = dialog.querySelector('[data-quick-view-error]').content.cloneNode(true);
    failed.querySelector('[data-quick-view-fallback]').href = url;
    body.replaceChildren(failed);
  }
}

function onClick(event) {
  const trigger = event.target instanceof Element ? event.target.closest('[data-quick-view]') : null;
  if (!trigger) return;
  const dialog = document.querySelector('[data-quick-view-dialog]');
  if (!dialog) return;
  event.preventDefault();
  open(dialog, trigger.dataset.quickView);
}

function setUpDialog(dialog) {
  if (dialog.dataset.ready) return;
  dialog.dataset.ready = '';
  dialog.querySelector('[data-quick-view-close]')?.addEventListener('click', () => dialog.close());
  // A click on the backdrop, outside the dialog's box, closes it.
  dialog.addEventListener('click', (event) => {
    const box = dialog.getBoundingClientRect();
    const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    if (event.target === dialog && outside) dialog.close();
  });
  // Escape first goes back from the size chart to the options, then closes. A canceled keydown stops the close; the
  // dialog's cancel event can't always be canceled, as Chrome lets a page keep a dialog open only after a click.
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const content = dialog.querySelector('[data-quick-view-content]');
    if (!content?.querySelector('[data-size-guide]:not([hidden])')) return;
    event.preventDefault();
    showSizeGuide(content, false);
  });
  dialog.addEventListener('close', () => dialog.querySelector('[data-quick-view-body]').replaceChildren());
}

// One listener for the page, however many times the script is added.
if (!window.quickViewListening) {
  window.quickViewListening = true;
  document.addEventListener('click', onClick);
  // The product is in the cart, so the cart can take over.
  if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
    subscribe(PUB_SUB_EVENTS.cartUpdate, (update) => {
      if (update.source !== 'product-form') return;
      for (const dialog of document.querySelectorAll('[data-quick-view-dialog][open]')) dialog.close();
    });
  }
}
