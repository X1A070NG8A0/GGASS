// step-sequence.ts - the <step-sequence> element
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

class StepSequence extends HTMLElement {
  points: Element[] = [];
  items: Element[] = [];
  status?: HTMLElement;

  connectedCallback(): void {
    if (this.status) return;
    this.points = [...this.querySelectorAll("svg .pt")];
    this.items = [...this.querySelectorAll(".legend li")];
    const legend = this.querySelector(".legend");
    if (!legend || !this.points.length || this.points.length !== this.items.length) return;

    const bar = document.createElement("p");
    bar.className = "seqbar";
    const prev = this.button("Previous", -1);
    const next = this.button("Next", 1);
    this.status = document.createElement("span");
    this.status.setAttribute("aria-live", "polite");
    this.status.textContent = `${this.points.length} steps`;
    bar.append(prev, " ", this.status, " ", next);
    legend.before(bar);

    for (const list of [this.points, this.items]) {
      list.forEach((el, i) => el.addEventListener("pointerenter", () => this.show(i)));
    }
  }

  button(text: string, delta: number): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.addEventListener("click", () => {
      const n = this.points.length;
      const at = this.points.findIndex((p) => p.classList.contains("on"));
      this.show(at < 0 ? (delta > 0 ? 0 : n - 1) : (at + delta + n) % n);
    });
    return b;
  }

  show(i: number): void {
    this.points.forEach((p, j) => p.classList.toggle("on", j === i));
    this.items.forEach((li, j) => li.classList.toggle("on", j === i));
    if (this.status) this.status.textContent = `Step ${i + 1} of ${this.points.length}`;
  }
}

customElements.define("step-sequence", StepSequence);
