// photo-zoom.ts - the <photo-zoom> element
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

// Expects an <a href> to the full-size image around the <img>.

class PhotoZoom extends HTMLElement {
  connectedCallback(): void {
    this.addEventListener("click", this);
  }

  disconnectedCallback(): void {
    this.removeEventListener("click", this);
  }

  handleEvent(e: Event): void {
    if (!(e instanceof MouseEvent) || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const a = e.target instanceof Element ? e.target.closest("a") : null;
    const img = a?.querySelector("img");
    if (!a || !img || !this.contains(a)) return;
    e.preventDefault();
    const dialog = document.createElement("dialog");
    dialog.className = "zoom";
    dialog.setAttribute("aria-label", `Enlarged photo: ${this.querySelector("figcaption")?.textContent ?? img.alt}`);
    const big = document.createElement("img");
    big.src = a.href;
    big.alt = img.alt;
    dialog.append(big);
    const caption = this.querySelector("figcaption");
    if (caption) dialog.append(caption.cloneNode(true));
    dialog.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }
}

customElements.define("photo-zoom", PhotoZoom);
