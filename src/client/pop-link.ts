// pop-link.ts - the <pop-link> element
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

import { PopWindow, SHOW_DELAY, scheduleSweep } from "./pop-window.ts";

const noHover = matchMedia("(hover: none)");
const EVENTS = ["pointerover", "pointerout", "click", "preview"];
let showTimer: number | undefined;

class PopLink extends HTMLElement {
  connectedCallback(): void {
    for (const type of EVENTS) this.addEventListener(type, this);
  }

  disconnectedCallback(): void {
    for (const type of EVENTS) this.removeEventListener(type, this);
    clearTimeout(showTimer);
  }

  handleEvent(e: Event): void {
    const a = this.querySelector("a[data-pop]");
    if (!(a instanceof HTMLAnchorElement)) return;
    if (e.type === "preview") {
      PopWindow.open(a, false, true);
      return;
    }
    if (e.type === "click") {
      if (!noHover.matches || !(e instanceof MouseEvent) || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      PopWindow.open(a, true);
      return;
    }
    if (!(e instanceof PointerEvent)) return;
    if (e.type === "pointerover") {
      if (e.pointerType !== "mouse") return;
      clearTimeout(showTimer);
      showTimer = setTimeout(() => PopWindow.open(a), SHOW_DELAY);
    } else if (!(e.relatedTarget instanceof Node && this.contains(e.relatedTarget))) {
      clearTimeout(showTimer);
      scheduleSweep();
    }
  }
}

customElements.define("pop-link", PopLink);
