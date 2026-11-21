// page-toc.client.ts - the <page-toc> element
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

class PageToc extends HTMLElement {
  links: HTMLAnchorElement[] = [];
  targets: HTMLElement[] = [];
  frame = 0;

  connectedCallback(): void {
    this.links = [...this.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
    this.targets = this.links.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter((t): t is HTMLElement => !!t);
    addEventListener("scroll", this, { passive: true });
    this.addEventListener("click", this);
    this.mark();
  }

  disconnectedCallback(): void {
    removeEventListener("scroll", this);
    this.removeEventListener("click", this);
  }

  handleEvent(e: Event): void {
    if (e.type === "click") {
      const popover = this.closest("[popover]");
      if (e.target instanceof Element && e.target.closest("a") && popover instanceof HTMLElement && popover.matches(":popover-open")) popover.hidePopover();
      return;
    }
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.mark());
  }

  mark(): void {
    const line = Math.min(innerHeight / 4, 160);
    let current = -1;
    this.targets.forEach((t, i) => {
      if (t.getBoundingClientRect().top <= line) current = i;
    });
    const id = this.targets[current]?.id;
    for (const a of this.links) {
      if (id && decodeURIComponent(a.hash.slice(1)) === id) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    }
  }
}

customElements.define("page-toc", PageToc);
