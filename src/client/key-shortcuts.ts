// key-shortcuts.ts - the <key-shortcuts> element
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

// The switch that turns the single keys off is required by WCAG 2.1.4.

const KEY = "ggass:shortcuts";
const KEYS: [string, string][] = [
  ["?", "Show this list"],
  ["/", "Search"],
  ["j", "Next section"],
  ["k", "Previous section"],
  ["t", "Table of contents"],
  ["p", "Preview the link that has focus"],
  ["Escape", "Close the popup windows"],
];

function enabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

function setEnabled(on: boolean): void {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, "off");
  } catch {
    // Blocked storage: the choice lasts until the page closes.
  }
}

let on = enabled();

// ggass.css shows the preview key on a focused popup link only while "on".
const syncShortcutsAttr = () => (document.documentElement.dataset.shortcuts = on ? "on" : "off");
syncShortcutsAttr();

const visibleHeadings = () => [...document.querySelectorAll<HTMLElement>("main h2[id], main h3[id]")].filter((h) => h.offsetParent !== null);

function jumpTo(heading: HTMLElement | undefined): void {
  if (!heading) return;
  // A jump, not a smooth scroll: scrolling motion makes some readers sick.
  heading.scrollIntoView({ block: "start" });
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}

class KeyShortcuts extends HTMLElement {
  dialog?: HTMLDialogElement;

  connectedCallback(): void {
    if (!this.firstChild) {
      const open = document.createElement("button");
      open.type = "button";
      open.className = "skip";
      open.textContent = "Keyboard shortcuts";
      open.addEventListener("click", () => this.help());
      this.append(open);
    }
    document.addEventListener("keydown", this);
  }

  disconnectedCallback(): void {
    document.removeEventListener("keydown", this);
  }

  handleEvent(e: Event): void {
    if (!(e instanceof KeyboardEvent) || !on || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || e.repeat) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || t.closest("input, textarea, select"))) return;
    const run: Partial<Record<string, () => void>> = {
      "?": () => this.help(),
      "/": () => {
        const input = document.querySelector<HTMLInputElement>("site-search input");
        if (input) input.focus();
        else location.assign("/search.html");
      },
      j: () => jumpTo(visibleHeadings().find((h) => h.getBoundingClientRect().top > 8)),
      k: () => jumpTo(visibleHeadings().findLast((h) => h.getBoundingClientRect().top < -8)),
      t: () => {
        const toc = document.getElementById("toc");
        if (!toc) return;
        if (getComputedStyle(toc).display === "none") toc.showPopover();
        (toc.querySelector<HTMLElement>("a[aria-current]") ?? toc.querySelector<HTMLElement>("a"))?.focus();
      },
      p: () => document.activeElement?.closest("pop-link")?.dispatchEvent(new Event("preview")),
    };
    const action = run[e.key];
    if (!action) return;
    e.preventDefault();
    action();
  }

  help(): void {
    if (!this.dialog) {
      const d = document.createElement("dialog");
      d.className = "shortcuts";
      d.setAttribute("aria-labelledby", "shortcuts-title");
      const title = document.createElement("h2");
      title.id = "shortcuts-title";
      title.textContent = "Keyboard shortcuts";
      const list = document.createElement("dl");
      for (const [key, what] of KEYS) {
        const dt = document.createElement("dt");
        const kbd = document.createElement("kbd");
        kbd.textContent = key;
        dt.append(kbd);
        const dd = document.createElement("dd");
        dd.textContent = what;
        list.append(dt, dd);
      }
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = on;
      box.addEventListener("change", () => {
        on = box.checked;
        syncShortcutsAttr();
        setEnabled(on);
      });
      label.append(box, " Single-key shortcuts on (Escape always works)");
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "Close";
      close.addEventListener("click", () => d.close());
      d.append(title, list, label, close);
      this.append(d);
      this.dialog = d;
    }
    this.dialog.showModal();
  }
}

customElements.define("key-shortcuts", KeyShortcuts);
