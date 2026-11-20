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

// <side-note> is a note that the build placed at the end of its paragraph,
// with a numbered reference in the text.
//
// On a wide screen the stylesheet puts each note in the margin, beside its
// reference. This script moves a note down when it would cover the note
// before it. In a browser without CSS anchor positioning, it also sets the
// height of each note. A tap on the reference highlights the note and moves
// the focus to it. The number at the start of a note goes back to its
// reference.
//
// On a narrow screen a note follows its paragraph. This script folds the
// notes, and a tap on a reference opens its note in place. Find in page
// still finds the text of a folded note (hidden="until-found") and opens it.

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
    // In a popup window, the reference is in the same window.
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

  // A note in the main text, not in the print list or a hidden copy.
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
    // The number at the start of the note goes back to the reference.
    if (e.currentTarget === this) {
      if (!this.ref || !(e.target instanceof Element && e.target.closest(".note-num"))) return;
      e.preventDefault();
      this.ref.focus();
      return;
    }
    e.preventDefault();
    if (inMargin(this)) {
      // The note is beside its reference already. Highlight it, and move the
      // focus to it, so that a keyboard or screen reader user reads it next.
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
