// list-filter.ts - the <list-filter> element
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

class ListFilter extends HTMLElement {
  status?: HTMLElement;

  connectedCallback(): void {
    this.addEventListener("input", this);
    if (!this.status) {
      this.status = document.createElement("p");
      this.status.className = "vh";
      this.status.setAttribute("role", "status");
      this.append(this.status);
    }
  }

  disconnectedCallback(): void {
    this.removeEventListener("input", this);
  }

  handleEvent(): void {
    const input = this.querySelector("input");
    const selector = this.getAttribute("items");
    if (!input || !selector) return;
    const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0, total = 0;
    for (const el of document.querySelectorAll(selector)) {
      if (!(el instanceof HTMLElement)) continue;
      const hay = (el.dataset.search ?? el.textContent).toLowerCase();
      el.hidden = !terms.every((t) => hay.includes(t));
      total++;
      if (!el.hidden) shown++;
    }
    if (this.status) this.status.textContent = terms.length ? `${shown} of ${total} shown` : "";
  }
}

customElements.define("list-filter", ListFilter);
