/**
 * Header account menu. A plain click on the account link opens the menu instead of following the link; a modified click,
 * or a browser without dialog support, still follows it. Wider screens get a popover under the icon, phones a bottom
 * sheet. Close, Escape and a tap outside close it, and focus goes back to the account link.
 */
if (!customElements.get('account-menu')) {
  class AccountMenu extends HTMLElement {
    static lockedStyles;

    connectedCallback() {
      if (this.initialized) return;
      this.trigger = this.querySelector(':scope > [data-account-open]');
      this.dialog = this.querySelector(':scope > dialog');
      this.panel = this.dialog?.querySelector('[data-account-panel]');
      this.backdrop = this.dialog?.querySelector('[data-account-backdrop]');
      if (!this.trigger || !this.panel || !this.backdrop) return;
      this.initialized = true;
      this.dataset.state = 'closed';
      this.motion = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.phone = window.matchMedia('(max-width: 749px)');
      this.onClick = event => {
        if (event.target.closest('[data-account-open]') === this.trigger) {
          if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          if (this.show()) event.preventDefault();
        } else if (event.target.closest('[data-account-close]')) {
          this.hide();
        } else if (event.target === this.backdrop && this.pointerStartedOnBackdrop) {
          this.hide();
        }
        this.pointerStartedOnBackdrop = false;
      };
      // A drag that starts in the panel and ends outside it is not a tap outside.
      this.onPointerDown = event => {
        this.pointerStartedOnBackdrop = event.target === this.backdrop;
      };
      this.onCancel = event => {
        event.preventDefault();
        this.hide();
      };
      // The browser can still close the dialog itself, for example on a repeated Escape.
      this.onClose = () => {
        if (this.dataset.state === 'closed') return;
        this.cancelTransition();
        this.release(true);
      };
      this.onResize = () => {
        if (this.dialog.open) this.place();
      };
      this.addEventListener('click', this.onClick);
      this.dialog.addEventListener('pointerdown', this.onPointerDown);
      this.dialog.addEventListener('cancel', this.onCancel);
      this.dialog.addEventListener('close', this.onClose);
      window.addEventListener('resize', this.onResize);
    }

    disconnectedCallback() {
      if (!this.initialized) return;
      this.cancelTransition();
      if (this.dialog.open) this.dialog.close();
      this.release(false);
      this.removeEventListener('click', this.onClick);
      this.dialog.removeEventListener('pointerdown', this.onPointerDown);
      this.dialog.removeEventListener('cancel', this.onCancel);
      this.dialog.removeEventListener('close', this.onClose);
      window.removeEventListener('resize', this.onResize);
      this.initialized = false;
    }

    show() {
      if (!this.initialized || typeof this.dialog.showModal !== 'function') return false;
      if (this.dialog.open && this.dataset.state !== 'closing') return true;
      if (!this.dialog.open) {
        this.lockScroll();
        try {
          this.dialog.showModal();
        } catch {
          this.release(false);
          return false;
        }
      }
      this.place();
      this.trigger.setAttribute('aria-expanded', 'true');
      this.dataset.state = 'open';
      this.transitionTo(true).then(transition => transition?.cancel());
      this.panel.querySelector('[data-account-close]')?.focus({ preventScroll: true });
      return true;
    }

    hide() {
      if (!this.dialog.open || this.dataset.state === 'closing') return;
      this.dataset.state = 'closing';
      this.transitionTo(false).then(transition => {
        if (!transition || this.dataset.state !== 'closing') return;
        this.dialog.close();
        // The closing frame holds until the dialog is gone, so the panel never flashes back.
        transition.cancel();
        this.release(true);
      });
    }

    /** Puts the popover under the account link, its end edge lined up with the cart icon. Phones use the sheet. */
    place() {
      if (this.phone.matches) return;
      const trigger = this.trigger.getBoundingClientRect();
      const icons = this.closest('.header__icons');
      const edge = (icons?.querySelector('.header__icon--cart .svg-wrapper') || icons || this.trigger).getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      const end = getComputedStyle(this).direction === 'rtl' ? edge.left : width - edge.right;
      this.dialog.style.setProperty('--account-menu-top', `${Math.round(trigger.bottom + 8)}px`);
      this.dialog.style.setProperty('--account-menu-end', `${Math.max(16, Math.round(end))}px`);
    }

    /**
     * The sheet slides up with the scrim fading in; the popover fades in 6px from above. Reduced motion skips it.
     * Resolves with the transition once it ends, or with nothing when a newer one replaced it.
     */
    transitionTo(opening) {
      this.cancelTransition();
      const animations = [];
      const duration = parseFloat(getComputedStyle(this.dialog).getPropertyValue('--account-menu-duration')) || 220;
      if (!this.motion.matches && typeof this.panel.animate === 'function') {
        const sheet = this.phone.matches;
        const hidden = sheet ? { transform: 'translateY(100%)' } : { opacity: 0, transform: 'translateY(-6px)' };
        const shown = sheet ? { transform: 'translateY(0)' } : { opacity: 1, transform: 'translateY(0)' };
        const options = { duration, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'both' };
        animations.push(this.panel.animate(opening ? [hidden, shown] : [shown, hidden], options));
        if (sheet) animations.push(this.backdrop.animate(opening ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], options));
      }
      const transition = { cancel: () => animations.forEach(animation => animation.cancel()) };
      this.transition = transition;
      // A hidden tab pauses animations, so nothing waits longer than the motion should take.
      return Promise.race([
        Promise.all(animations.map(animation => animation.finished)),
        new Promise(resolve => setTimeout(resolve, animations.length ? duration + 80 : 0)),
      ])
        .catch(() => {})
        .then(() => {
          if (this.transition !== transition) return undefined;
          this.transition = undefined;
          return transition;
        });
    }

    cancelTransition() {
      const previous = this.transition;
      this.transition = undefined;
      previous?.cancel();
    }

    lockScroll() {
      if (AccountMenu.lockedStyles) return;
      AccountMenu.lockedStyles = ['overflow', 'padding-right'].map(name => ({
        name,
        value: document.body.style.getPropertyValue(name),
        priority: document.body.style.getPropertyPriority(name),
      }));
      const scrollbar = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbar > 0) {
        const padding = parseFloat(getComputedStyle(document.body).paddingRight) || 0;
        document.body.style.setProperty('padding-right', `${padding + scrollbar}px`);
      }
      document.body.style.setProperty('overflow', 'hidden');
    }

    release(restoreFocus) {
      this.dataset.state = 'closed';
      this.trigger.setAttribute('aria-expanded', 'false');
      if (AccountMenu.lockedStyles) {
        AccountMenu.lockedStyles.forEach(({ name, value, priority }) => {
          if (value) document.body.style.setProperty(name, value, priority);
          else document.body.style.removeProperty(name);
        });
        AccountMenu.lockedStyles = undefined;
      }
      if (restoreFocus && this.trigger.isConnected) this.trigger.focus({ preventScroll: true });
    }
  }

  customElements.define('account-menu', AccountMenu);
}
