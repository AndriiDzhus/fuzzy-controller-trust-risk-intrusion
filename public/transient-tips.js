/*
 * Closing of transient tooltips (position: fixed, opened by hover) on touch screens.
 *
 * On a desktop a chart tooltip follows the mouse and closes on mouseleave. On a
 * phone a tap emulates the hover but never the leave, so the tooltip stayed pinned
 * to the screen while the page scrolled and closed only after another tap on the
 * chart. A tooltip registered here also closes when
 *   - the page scrolls (or a scroll container that holds the element that opened it),
 *   - the user presses anywhere outside the element that opened it,
 *   - the window is resized / rotated or the tab is hidden.
 *
 * register({ owner, hide, isOpen }) — owner: element (or a function returning the
 * current one) inside which a press keeps the tooltip; hide(): closes it;
 * isOpen(): whether this tooltip is currently shown (several charts share one
 * tooltip element, so only the one that owns it may close it).
 */
(function (root) {
  const entries = new Set();
  let bound = false;

  const resolve = (owner) => (typeof owner === "function" ? owner() : owner) || null;

  function dismiss(shouldClose) {
    entries.forEach((entry) => {
      if (entry.isOpen && !entry.isOpen()) return;
      if (shouldClose(resolve(entry.owner))) entry.hide();
    });
  }

  function isPageScroller(target) {
    return target === document || target === document.documentElement || target === document.body;
  }

  function bind() {
    if (bound || typeof document === "undefined") return;
    bound = true;
    // "scroll" does not bubble: the capture phase also sees nested scroll containers.
    // A container that does not hold the chart (e.g. an auto-scrolling log) is ignored.
    document.addEventListener(
      "scroll",
      (event) => {
        const scroller = event.target;
        dismiss((owner) => isPageScroller(scroller) || !owner || (scroller.contains && scroller.contains(owner)));
      },
      { capture: true, passive: true }
    );
    document.addEventListener(
      "pointerdown",
      (event) => dismiss((owner) => !(owner && owner.contains(event.target))),
      { capture: true, passive: true }
    );
    root.addEventListener("resize", () => dismiss(() => true), { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) dismiss(() => true);
    });
  }

  function register({ owner = null, hide, isOpen = null } = {}) {
    if (typeof hide !== "function") return () => {};
    const entry = { owner, hide, isOpen };
    entries.add(entry);
    bind();
    return () => entries.delete(entry);
  }

  root.transientTips = { register, dismissAll: () => dismiss(() => true) };
})(typeof window !== "undefined" ? window : globalThis);
