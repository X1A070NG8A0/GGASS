// section-tabs.ts - the <section-tabs> element
// Copyright (C) 2026 GGASS project
//
// This file is part of GGASS.
//
// GGASS is free software: you can redistribute it and/or modify it
// under the terms of either:
//
//   * the GNU Lesser General Public License as published by the Free
//     Software Foundation; either version 2.1 of the License, or (at your
//     option) any later version.
//
// or
//
//   * the Apache License, Version 2.0.
//
// or both in parallel, as here.
//
// GGASS is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Lesser General Public
// License and the Apache License for more details.
//
// You should have received a copy of the GNU Lesser General Public
// License and the Apache License along with GGASS, in the LICENSES
// directory; if not, see <https://www.gnu.org/licenses/> and
// <https://www.apache.org/licenses/LICENSE-2.0>.
//
// SPDX-License-Identifier: Apache-2.0 OR LGPL-2.1-or-later

// Each tab page must hold a copy of this section, with the same id and its own
// tab current.

class SectionTabs extends HTMLElement {
  request?: AbortController;

  connectedCallback(): void {
    this.addEventListener("click", this);
    window.addEventListener("popstate", this);
  }

  disconnectedCallback(): void {
    this.removeEventListener("click", this);
    window.removeEventListener("popstate", this);
  }

  handleEvent(e: Event): void {
    if (e.type === "popstate") {
      // Only the element that links to the address swaps. If no element
      // links to it (a page whose first tab links to another address), each
      // element takes its section from the page at the address.
      const path = location.pathname;
      const linked = (root: ParentNode) => [...root.querySelectorAll("section-tabs a")].some((a) => a.getAttribute("href") === path);
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

  async show(href: string, push: boolean): Promise<void> {
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
      current.replaceWith(next);
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
