// site-search.client.ts - the <site-search> element
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

type Entry = { k: string; t: string; x: string; u: string };

class SiteSearch extends HTMLElement {
  index: Entry[] = [];
  abort?: AbortController;
  status?: HTMLElement;

  async connectedCallback(): Promise<void> {
    const input = this.querySelector("input");
    // The element was hidden at load, so the browser did not apply autofocus.
    if (input?.autofocus) input.focus();
    if (!input || !this.querySelector("ol")) return;
    this.status = document.createElement("p");
    this.status.className = "vh";
    this.status.setAttribute("role", "status");
    input.after(this.status);
    this.abort = new AbortController();
    const { signal } = this.abort;
    input.addEventListener("input", () => this.run(input.value), { signal });
    try {
      // This module is in assets/, one folder below the site root.
      this.index = (await (await fetch(new URL("../search-index.json", import.meta.url), { signal })).json()) as Entry[];
    } catch {
      return; // Disconnected before the load, or no index.
    }
    const q = new URLSearchParams(location.search).get("q");
    if (q) input.value = q;
    this.run(input.value);
  }

  disconnectedCallback(): void {
    this.abort?.abort();
  }

  run(query: string): void {
    const out = this.querySelector("ol");
    if (!out) return;
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    out.replaceChildren();
    if (this.status) this.status.textContent = "";
    if (!terms.length) return;
    const hits = this.index.filter((e) => {
      const hay = `${e.t} ${e.x}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    for (const e of hits.slice(0, 80)) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = e.u;
      a.textContent = e.t;
      const kind = document.createElement("span");
      kind.className = "kind";
      kind.textContent = e.k;
      const snip = document.createElement("p");
      snip.className = "meta";
      const at = e.x.toLowerCase().indexOf(terms[0]);
      snip.textContent = at >= 0 ? `…${e.x.slice(Math.max(0, at - 60), at + 120)}…` : e.x.slice(0, 160);
      li.append(kind, " ", a, snip);
      out.append(li);
    }
    if (this.status) this.status.textContent = hits.length ? `${hits.length} results${hits.length > 80 ? ", 80 shown" : ""}` : "No results";
    if (!hits.length) {
      const li = document.createElement("li");
      li.className = "meta";
      li.textContent = "Nothing matches that.";
      out.append(li);
    }
  }
}

customElements.define("site-search", SiteSearch);
