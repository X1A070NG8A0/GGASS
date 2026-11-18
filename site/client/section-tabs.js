// @ts-check
// <section-tabs> holds a <nav> of tab links. Each tab links to a real page,
// and each of those pages has a copy of the section (a <section id="...">)
// that holds this element, with its own tab current. A click gets that page
// and puts its copy of the section in place of the current one, with a
// cross-fade. The address changes, and the Back button shows the earlier tab.
// A modified click (Ctrl, Shift, Alt, Cmd) or a failed request falls back to
// a normal page load. Without JavaScript, the links open the tab pages.

class SectionTabs extends HTMLElement {
  /** @type {AbortController | undefined} */
  request;

  connectedCallback() {
    this.addEventListener("click", this);
    window.addEventListener("popstate", this);
  }

  disconnectedCallback() {
    this.removeEventListener("click", this);
    window.removeEventListener("popstate", this);
  }

  /** @param {Event} e */
  handleEvent(e) {
    if (e.type === "popstate") {
      // Only the element that links to the address swaps. If no element
      // links to it (a page whose first tab links to another address), each
      // element takes its section from the page at the address.
      const path = location.pathname;
      const linked = (/** @type {ParentNode} */ root) => [...root.querySelectorAll("section-tabs a")].some((a) => a.getAttribute("href") === path);
      if ([...this.querySelectorAll("a")].some((a) => a.getAttribute("href") === path) || !linked(document)) void this.show(path, false);
      return;
    }
    if (!(e instanceof MouseEvent) || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const a = e.target instanceof Element ? e.target.closest("a") : null;
    const href = a?.getAttribute("href");
    if (!href || !this.contains(a)) return;
    e.preventDefault();
    void this.show(href, true);
  }

  /** @param {string} href @param {boolean} push */
  async show(href, push) {
    // A second click cancels the first request.
    this.request?.abort();
    this.request = new AbortController();
    try {
      const r = await fetch(href, { signal: this.request.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const page = new DOMParser().parseFromString(await r.text(), "text/html");
      const current = this.closest("section[id]");
      const next = current ? page.getElementById(current.id) : null;
      if (!next || !current) throw new Error("no section for these tabs");
      if (push) history.pushState(null, "", href);
      document.title = page.title;
      const swap = () => current.replaceWith(next);
      if (document.startViewTransition) {
        // On Back, two elements can swap at the same time. The second
        // transition skips the first one, which rejects its ready promise.
        // The swap still happens, so ignore that rejection.
        const t = document.startViewTransition(swap);
        t.ready.catch(() => {});
        await t.updateCallbackDone;
      } else swap();
      // The clicked link is gone. Put focus on the new current tab.
      if (document.activeElement === document.body) {
        const now = next.querySelector("section-tabs a[aria-current]");
        if (now instanceof HTMLElement) now.focus();
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) location.assign(href);
    }
  }
}

customElements.define("section-tabs", SectionTabs);
