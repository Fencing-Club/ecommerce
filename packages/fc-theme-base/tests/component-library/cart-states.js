// Puts the rendered cart into the state named by body[data-lab-state], using the production controllers where
// they have a method for it. Nothing here takes focus, so frames on the index page don't scroll it.
(() => {
  const state = document.body.dataset.labState;
  const drawer = document.querySelector('cart-drawer');
  const view = document.querySelector('cart-drawer-items, cart-items');
  const root = drawer || view;
  const controller = customElements.get('cart-items');
  const extras = root.querySelector('cart-extras');
  const discount = root.querySelector('cart-discount');
  const note = root.querySelector('cart-note');
  const rows = () => [...root.querySelectorAll('[data-cart-lines] > .fc-line')];
  const decode = value => new DOMParser().parseFromString(value, 'text/html').documentElement.textContent;
  const text = (key, replacements = {}) => Object.entries(replacements).reduce((value, [name, replacement]) => value.replace(`[${name}]`, replacement), decode(window.cartStrings[key]));
  const setFeedback = (element, message, tone = 'error') => {
    element.dataset.tone = tone;
    element.querySelector('.fc-feedback__text').textContent = message;
    element.hidden = false;
  };
  const openEditor = kind => {
    extras.dataset.open = kind;
    extras.syncButtons();
  };
  const writeNote = () => {
    openEditor('note');
    note.textarea.value = 'Please ship the foil and mask together.';
    note.updateCount();
  };
  const removed = () => {
    view.showRemoved(1, { variantId: '8031', quantity: 2, title: 'Grip fencing glove', properties: {}, sellingPlan: null });
    return root.querySelector('.fc-line--removed');
  };

  if (drawer) {
    drawer.classList.add('animate', 'active');
    document.body.classList.add('overflow-hidden');
  }

  const states = {
    'just-added': () => view.showAddedToast({ key: rows()[0].dataset.lineKey, product_title: rows()[0].dataset.title }),
    updating: () => {
      rows()[2].dataset.state = 'updating';
      controller.mutationCount = 1;
    },
    'quantity-error': () => view.setLineFeedback(rows()[2], text('quantityChangeError')),
    'remove-error': () => view.setLineFeedback(rows()[2], text('removeError')),
    removed,
    'undo-error': () => view.setLineFeedback(removed(), text('undoError', { title: 'Grip fencing glove' })),
    'kit-open': () => root.querySelector('.fc-line__contents')?.setAttribute('open', ''),
    'discount-open': () => openEditor('discount'),
    'discount-applying': () => {
      openEditor('discount');
      discount.input.value = 'WELCOME10';
      discount.setState('applying');
      controller.mutationCount = 1;
    },
    'discount-invalid': () => {
      openEditor('discount');
      discount.input.value = 'SPRING25';
      discount.setState('invalid');
      setFeedback(discount.feedback, discount.dataset.invalid.replace('[code]', 'SPRING25'));
    },
    'discount-error': () => {
      openEditor('discount');
      discount.input.value = 'WELCOME10';
      setFeedback(discount.feedback, discount.dataset.error);
    },
    'discount-remove-error': () => {
      const summary = root.querySelector('[data-cart-summary]');
      setFeedback(summary.querySelector('[data-discount-feedback] .fc-feedback'), discount.dataset.removeError.replace('[code]', 'WELCOME10'));
    },
    'note-open': () => openEditor('note'),
    'note-unsaved': writeNote,
    'note-saving': () => {
      writeNote();
      note.setSaving(true);
      controller.mutationCount = 1;
    },
    'note-error': () => {
      writeNote();
      setFeedback(note.feedback, note.dataset.error);
    },
    'checkout-waiting': () => {
      controller.mutationCount = 1;
    },
    'checkout-opening': () => root.querySelectorAll('[data-checkout-state]').forEach(holder => holder.setAttribute('data-opening', '')),
    'checkout-failed': () => root.querySelectorAll('[data-checkout-state]').forEach(holder => holder.setAttribute('data-failed', '')),
    'gift-changing': () => root.querySelector('.fc-gift-change')?.setAttribute('open', ''),
    'gift-change-error': () => {
      const change = root.querySelector('.fc-gift-change');
      change.setAttribute('open', '');
      const options = change.querySelector('cart-gift-options');
      setFeedback(options.feedback, options.dataset.changeError.replace('[gift]', 'Training towel'));
    },
    loading: () => {
      root.dataset.loadState = 'loading';
    },
    'load-failed': () => {
      root.dataset.loadState = 'failed';
    },
  };
  states[state]?.();
  controller.updateCheckoutState();
})();
