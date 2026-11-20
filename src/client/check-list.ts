// check-list.ts - the <check-list> element
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

// <check-list> holds lists of items that each have a checkbox with
// data-done-key. The stylesheet crosses out a ticked item with :has().
// This element keeps the ticks in localStorage. The items stay in place.

const PREFIX = "done:";

function stored(key: string): boolean {
  try {
    return localStorage.getItem(PREFIX + key) === "1";
  } catch {
    return false;
  }
}

function store(key: string, done: boolean): void {
  try {
    if (done) localStorage.setItem(PREFIX + key, "1");
    else localStorage.removeItem(PREFIX + key);
  } catch {
    // Private mode or blocked storage: the ticks do not persist.
  }
}

class CheckList extends HTMLElement {
  connectedCallback(): void {
    for (const box of this.querySelectorAll("input[data-done-key]")) {
      if (box instanceof HTMLInputElement) box.checked = stored(box.dataset.doneKey ?? "");
    }
    this.addEventListener("change", this);
  }

  disconnectedCallback(): void {
    this.removeEventListener("change", this);
  }

  handleEvent(e: Event): void {
    const box = e.target;
    if (!(box instanceof HTMLInputElement) || !box.dataset.doneKey) return;
    store(box.dataset.doneKey, box.checked);
  }
}

customElements.define("check-list", CheckList);
