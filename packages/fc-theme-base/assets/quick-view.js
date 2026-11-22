/**
 * Quick view: a product card's `[data-quick-view]` button opens the page's quick view dialog with that product's
 * `product-quick-view` section. Its photos are a `photo-gallery`, and picking a variant shows the variant's photo,
 * and adding to the cart closes the dialog so the cart can open. A request that fails says so, with Try again and the
 * product page.
 */
const sectionId = 'product-quick-view';

/** Picking a variant shows its photo. */
function watchGallery(content) {
  content.addEventListener('product-options:variant', (event) => {
    const mediaId = event.detail.variant.media;
    if (mediaId) content.querySelector('photo-gallery')?.showMedia(mediaId);
  });
}

async function open(dialog, url, { retrying = false } = {}) {
  setUpDialog(dialog);
  const body = dialog.querySelector('[data-quick-view-body]');
  // Try again goes away with the message, so focus waits on Close until the product or the message is back.
  if (retrying) dialog.querySelector('[data-quick-view-close]')?.focus();
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
  } catch {
    const failed = dialog.querySelector('[data-quick-view-error]').content.cloneNode(true);
    failed.querySelector('[data-quick-view-fallback]').href = url;
    const retry = failed.querySelector('[data-quick-view-retry]');
    retry.addEventListener('click', () => open(dialog, url, { retrying: true }));
    body.replaceChildren(failed);
    dialog.setAttribute('aria-labelledby', 'QuickViewError');
    if (retrying) retry.focus();
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
