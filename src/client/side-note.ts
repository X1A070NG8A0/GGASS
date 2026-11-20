// side-note.ts - the <side-note> element
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

const ANCHORS = CSS.supports("anchor-name: --a");
const UNTIL_FOUND = "onbeforematch" in HTMLElement.prototype;
const notes = new Set<SideNote>();
let frame = 0;

const inMargin = (note: HTMLElement) => getComputedStyle(note).position === "absolute";

function placeAll(): void {
  const list = [...notes].filter((n) => n.isConnected && n.inPage());
  list.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  for (const note of list) note.sync();
  const wide = list.filter(inMargin);
  for (const note of wide) {
    note.style.marginTop = "";
    if (!ANCHORS && note.ref && note.offsetParent) {
      const box = note.offsetParent.getBoundingClientRect();
      note.style.top = `${note.ref.getBoundingClientRect().top - box.top}px`;
    }
  }
  let bottom = -Infinity;
  for (const note of wide) {
    const r = note.getBoundingClientRect();
    const shift = Math.max(0, bottom + 8 - r.top);
    if (shift) note.style.marginTop = `${shift}px`;
    bottom = r.bottom + shift;
  }
}

const schedule = () => {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(placeAll);
};
new ResizeObserver(schedule).observe(document.documentElement);
void document.fonts.ready.then(schedule);

class SideNote extends HTMLElement {
  ref?: HTMLAnchorElement;
  open = false;

  connectedCallback(): void {
    // A popup holds a copy of the page, so the id repeats: search this window.
    const scope: ParentNode = this.closest("pop-window") ?? document;
    const ref = scope.querySelector(`#${CSS.escape(this.id.replace(/^note-/, "note-ref-"))}`);
    this.ref = ref instanceof HTMLAnchorElement ? ref : undefined;
    this.ref?.addEventListener("click", this);
    this.ref?.setAttribute("aria-controls", this.id);
    this.addEventListener("beforematch", this);
    this.addEventListener("click", this);
    notes.add(this);
    schedule();
  }

  disconnectedCallback(): void {
    this.ref?.removeEventListener("click", this);
    this.removeEventListener("beforematch", this);
    this.removeEventListener("click", this);
    notes.delete(this);
  }

  inPage(): boolean {
    return !this.closest(".endnotes");
  }

  handleEvent(e: Event): void {
    if (e.type === "beforematch") {
      this.open = true;
      this.sync();
      return;
    }
    if (!(e instanceof MouseEvent) || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    if (e.currentTarget === this) {
      if (!this.ref || !(e.target instanceof Element && e.target.closest(".note-num"))) return;
      e.preventDefault();
      this.ref.focus();
      return;
    }
    e.preventDefault();
    if (inMargin(this)) {
      // Focus the note, so keyboard and screen reader users read it next.
      this.classList.remove("flash");
      void this.offsetWidth;
      this.classList.add("flash");
      this.querySelector<HTMLElement>(".note-num")?.focus({ preventScroll: true });
      return;
    }
    this.open = !this.open;
    this.sync();
  }

  sync(): void {
    if (inMargin(this)) {
      this.removeAttribute("hidden");
      this.ref?.removeAttribute("aria-expanded");
      return;
    }
    if (this.open) this.removeAttribute("hidden");
    else this.setAttribute("hidden", UNTIL_FOUND ? "until-found" : "");
    this.ref?.setAttribute("aria-expanded", String(this.open));
  }
}

customElements.define("side-note", SideNote);
