// share-button.client.ts - the <share-button> element
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

class ShareButton extends HTMLElement {
  connectedCallback(): void {
    if (this.firstChild || typeof navigator.share !== "function") return;
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "Share";
    // A closed share sheet or a refusal rejects the promise. Both are normal.
    b.addEventListener("click", () => void navigator.share({ title: document.title, url: location.href }).catch(() => undefined));
    this.append(b);
  }
}

customElements.define("share-button", ShareButton);
