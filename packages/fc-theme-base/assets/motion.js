/**
 * Row motion shared across the theme. Rows open as they appear and close as they go, with a fade, so a list never
 * jumps. It uses the entrance timing (220ms, standard easing), and reduced motion skips it.
 */
(() => {
  const DURATION = 220;
  const EASING = 'cubic-bezier(0.2, 0, 0, 1)';
  const CLOSED = { height: '0px', paddingTop: '0px', paddingBottom: '0px', borderBottomWidth: '0px', opacity: 0 };

  const moves = element => typeof element.animate === 'function' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function run(element, opening) {
    const style = getComputedStyle(element);
    const open = {
      height: `${element.getBoundingClientRect().height}px`,
      paddingTop: style.paddingTop,
      paddingBottom: style.paddingBottom,
      borderBottomWidth: style.borderBottomWidth,
      opacity: 1,
    };
    element.style.overflow = 'hidden';
    const animation = element.animate(opening ? [CLOSED, open] : [open, CLOSED], { duration: DURATION, easing: EASING, fill: opening ? 'none' : 'forwards' });
    // A hidden tab pauses animations, so nothing waits on one for longer than it should take.
    return Promise.race([animation.finished.catch(() => {}), new Promise(resolve => setTimeout(resolve, DURATION + 80))]);
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
})();
