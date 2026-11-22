/**
 * Motion shared across the theme, on the entrance timing (220ms, standard easing). Reduced motion skips it, and a hidden
 * tab never holds it up.
 * - Rows open as they appear and close as they go, with a fade, so a list never jumps (window.RowMotion).
 * - A `<details data-motion>` shows and hides its content the same way: the element after its summary grows from no
 *   height and fades in, and shrinks and fades out. While it closes, the details keeps `open`, so its content stays
 *   visible, and has `data-closing`; style what marks it open with `[open]:not([data-closing])`. A click while it moves
 *   turns it around from where it is.
 */
(() => {
  const DURATION = 220;
  const EASING = 'cubic-bezier(0.2, 0, 0, 1)';
  const CLOSED = { height: '0px', paddingTop: '0px', paddingBottom: '0px', borderBottomWidth: '0px', opacity: 0 };

  const moves = element => typeof element.animate === 'function' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  /** The element's size and opacity as it looks now, partway through an animation included. */
  function frame(element) {
    const style = getComputedStyle(element);
    return {
      height: `${element.getBoundingClientRect().height}px`,
      paddingTop: style.paddingTop,
      paddingBottom: style.paddingBottom,
      borderBottomWidth: style.borderBottomWidth,
      opacity: Number(style.opacity),
    };
  }

  /** Resolves when the animation ends. A hidden tab pauses animations, so nothing waits on one for longer than it should take. */
  function settle(animation) {
    return Promise.race([animation.finished.catch(() => {}), new Promise(resolve => setTimeout(resolve, DURATION + 80))]);
  }

  function run(element, opening) {
    const open = { ...frame(element), opacity: 1 };
    element.style.overflow = 'hidden';
    return settle(element.animate(opening ? [CLOSED, open] : [open, CLOSED], { duration: DURATION, easing: EASING, fill: opening ? 'none' : 'forwards' }));
  }

  /** Opens a row that just appeared, from no height to its own. */
  async function openRow(element) {
    if (!moves(element)) return;
    await run(element, true);
    element.style.overflow = '';
  }

  /** Closes a row to no height, then removes it. */
  async function closeRow(element) {
    if (moves(element)) await run(element, false);
    element.remove();
  }

  /** The list's rows, leaving out rows that are closing. */
  function currentRows(container, { rows }) {
    return rows(container).filter(row => !row.hasAttribute('data-leaving'));
  }

  /**
   * Animates what a re-render changed in a list. Call it right after the render with the rows from before it
   * (currentRows). Rows with a new key open. A row whose key is gone comes back in its old place, inert and hidden
   * from assistive technology, just long enough to close.
   * options.rows(container): every row. options.key(row): a row's identity across renders. options.listFor(row,
   * container): where a closing row goes back, when that isn't the container itself.
   */
  function animateListChanges(container, before, options) {
    if (!before.length || !moves(container)) return;
    const { key, listFor } = options;
    const after = new Map(currentRows(container, options).map(row => [key(row), row]));
    const keys = new Set(before.map(key));
    after.forEach((row, rowKey) => {
      if (!keys.has(rowKey)) openRow(row);
    });
    before.forEach((row, index) => {
      if (after.has(key(row))) return;
      const anchor = before.slice(index + 1).map(next => after.get(key(next))).find(Boolean);
      const list = listFor?.(row, container) || container;
      row.setAttribute('data-leaving', '');
      row.setAttribute('aria-hidden', 'true');
      row.inert = true;
      if (anchor?.parentElement === list) list.insertBefore(row, anchor);
      else list.append(row);
      closeRow(row);
    });
  }

  window.RowMotion = { openRow, closeRow, currentRows, animateListChanges };

  /** The disclosures moving now, each with its animation and which way it goes. */
  const disclosures = new WeakMap();

  /** Shows or hides a disclosure's content, starting from wherever it is now. */
  function toggleDisclosure(details, content) {
    const moving = disclosures.get(details);
    const opening = moving ? !moving.opening : !details.open;
    const from = moving || details.open ? frame(content) : CLOSED;
    moving?.animation.cancel();
    details.open = true;
    details.toggleAttribute('data-closing', !opening);
    const to = opening ? { ...frame(content), opacity: 1 } : CLOSED;
    content.style.overflow = 'hidden';
    const animation = content.animate([from, to], { duration: DURATION, easing: EASING, fill: 'forwards' });
    const motion = { animation, opening };
    disclosures.set(details, motion);
    settle(animation).then(() => {
      if (disclosures.get(details) !== motion) return;
      disclosures.delete(details);
      if (!opening) {
        details.open = false;
        details.removeAttribute('data-closing');
      }
      animation.cancel();
      content.style.overflow = '';
    });
  }

  document.addEventListener('click', event => {
    const summary = event.target.closest?.('summary');
    const details = summary?.parentElement;
    if (event.defaultPrevented || !details?.matches('details[data-motion]') || event.target.closest('a, button, input, select, textarea')) return;
    const content = summary.nextElementSibling;
    if (!content || !moves(content)) return;
    event.preventDefault();
    toggleDisclosure(details, content);
  });
})();
