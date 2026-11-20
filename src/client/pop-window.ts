// pop-window.ts - the <pop-window> element
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

export const SHOW_DELAY = 220;
const SWEEP_DELAY = 350;
const NOT_FOUND = "<p class='meta'>Not found.</p>";
const ANCHORS = CSS.supports("anchor-name: --a");
const INVOKERS = "commandForElement" in HTMLButtonElement.prototype;

const cache = new Map<string, Promise<string>>();

function fragment(url: string): Promise<string> {
  let page = cache.get(url);
  if (!page) {
    page = fetch(url).then((r) => (r.ok ? r.text() : NOT_FOUND), () => NOT_FOUND);
    cache.set(url, page);
  }
  return page;
}

let serial = 0;
let topWindow: PopWindow | undefined;

const windows = (): PopWindow[] => [...document.querySelectorAll("pop-window")].filter((w): w is PopWindow => w instanceof PopWindow);

export class PopWindow extends HTMLElement {
  link?: HTMLAnchorElement;
  parentWin?: PopWindow;
  pinned = false;
  sheet = false;
  focusOnOpen = false;
  abort?: AbortController;

  static open(link: HTMLAnchorElement, sheet = false, focusOnOpen = false): void {
    const all = windows();
    if (all.some((w) => w.link === link)) return;
    const parent = link.closest("pop-window");
    const parentWin = parent instanceof PopWindow ? parent : undefined;
    for (const w of all) if (sheet ? w.sheet : w.parentWin === parentWin && !w.pinned) w.close();
    const win = document.createElement("pop-window") as PopWindow;
    win.link = link;
    win.parentWin = sheet ? undefined : parentWin;
    win.sheet = sheet;
    win.focusOnOpen = sheet || focusOnOpen;
    document.body.append(win);
  }

  connectedCallback(): void {
    const link = this.link;
    if (!link || this.abort) return;
    this.abort = new AbortController();
    const { signal } = this.abort;
    this.id = `pw-${++serial}`;
    // A sheet is an auto popover: a tap outside it or Escape closes it.
    this.popover = this.sheet ? "auto" : "manual";
    this.setAttribute("role", "dialog");
    this.setAttribute("aria-labelledby", `${this.id}-title`);

    const bar = document.createElement("div");
    bar.className = "popbar";
    const title = document.createElement("span");
    title.className = "poptitle";
    title.id = `${this.id}-title`;
    title.textContent = link.textContent.trim();
    const open = document.createElement("a");
    open.className = "popopen";
    open.href = link.href;
    open.textContent = this.sheet ? "Open page" : "open";
    open.title = "Open the full page";
    if (this.sheet) {
      this.classList.add("sheet");
      bar.append(title, open, this.button("--close", "×", "Close"));
    } else {
      title.title = "Drag to move";
      bar.append(title, open, this.button("--tile", "tile", "Put the pinned windows side by side"), this.button("--pin", "pin", "Keep this window open"), this.button("--close", "×", "Close window"));
    }
    const body = document.createElement("div");
    body.className = "popbody";
    body.textContent = "Loading…";
    this.append(bar, body);

    this.addEventListener("command", this, { signal });
    if (!INVOKERS) this.addEventListener("click", this, { signal });
    if (this.focusOnOpen) this.tabIndex = -1;
    if (this.sheet) {
      this.addEventListener("toggle", this, { signal });
    } else {
      this.addEventListener("pointerdown", this, { signal });
      this.addEventListener("mouseleave", this, { signal });
      this.place();
    }
    this.showPopover();
    topWindow = this;
    if (this.focusOnOpen) this.focus({ preventScroll: true });
    void this.load(body);
  }

  disconnectedCallback(): void {
    this.abort?.abort();
  }

  handleEvent(e: Event): void {
    switch (e.type) {
      case "command":
        this.run((e as Event & { command: string }).command);
        break;
      case "click": {
        // Only for browsers without invoker commands.
        const b = e.target instanceof Element ? e.target.closest("button[command]") : null;
        if (b && this.contains(b)) this.run(b.getAttribute("command") ?? "");
        break;
      }
      case "toggle":
        if ((e as ToggleEvent).newState === "closed") this.close();
        break;
      case "pointerdown":
        this.raise();
        if (e instanceof PointerEvent && e.target instanceof Element && e.target.closest(".popbar") && !e.target.closest("button, a")) this.drag(e);
        break;
      case "mouseleave":
        scheduleSweep();
        break;
    }
  }

  button(command: string, text: string, tip: string): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("command", command);
    b.setAttribute("commandfor", this.id);
    b.textContent = text;
    b.title = tip;
    // The visible text can be a symbol (×), so the name comes from the tip.
    b.setAttribute("aria-label", tip);
    if (command === "--pin") b.setAttribute("aria-pressed", "false");
    return b;
  }

  run(command: string): void {
    if (command === "--close") this.close();
    if (command === "--pin") this.setPinned(!this.pinned);
    if (command === "--tile") this.tile();
  }

  setPinned(on: boolean): void {
    this.pinned = on;
    this.classList.toggle("pinned", on);
    if (on) this.unanchor();
    const pin = this.querySelector('button[command="--pin"]');
    if (pin) {
      pin.textContent = on ? "unpin" : "pin";
      pin.setAttribute("aria-pressed", String(on));
    }
  }

  tile(): void {
    this.setPinned(true);
    const list = windows().filter((w) => w.pinned && !w.sheet);
    const gap = 8;
    const width = Math.max(288, (innerWidth - gap * (list.length + 1)) / list.length);
    list.forEach((w, i) => {
      w.unanchor();
      Object.assign(w.style, {
        left: `${gap + i * (width + gap)}px`,
        top: `${gap}px`,
        width: `${width}px`,
        height: `${innerHeight - 2 * gap}px`,
        maxHeight: `${innerHeight - 2 * gap}px`,
      });
    });
  }

  async load(body: HTMLElement): Promise<void> {
    const url = this.link?.dataset.pop;
    if (!url) return;
    body.innerHTML = await fragment(url);
    if (!ANCHORS && !this.pinned && !this.sheet) this.place();
  }

  place(): void {
    const link = this.link;
    if (!link) return;
    if (ANCHORS) {
      const name = `--${this.id}`;
      link.style.setProperty("anchor-name", name);
      this.style.setProperty("position-anchor", name);
      this.classList.add("anchored");
      return;
    }
    // The window shrinks to the room it has, so it never covers its link.
    const r = link.getBoundingClientRect();
    const w = this.offsetWidth;
    this.style.maxHeight = "";
    const h = this.offsetHeight;
    const below = innerHeight - r.bottom - 14, above = r.top - 14;
    const down = h <= below || below >= above;
    const room = Math.min(down ? below : above, innerHeight * 0.7);
    this.style.maxHeight = `${room}px`;
    this.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
    this.style.top = `${down ? r.bottom + 6 : r.top - 6 - Math.min(h, room)}px`;
  }

  unanchor(): void {
    if (!this.classList.contains("anchored")) return;
    const r = this.getBoundingClientRect();
    this.classList.remove("anchored");
    this.style.left = `${r.left}px`;
    this.style.top = `${r.top}px`;
    this.style.maxHeight = `${r.height}px`;
  }

  // The last popover shown is on top. Show this window and its children
  // again, so that they move to the top in the same order.
  raise(): void {
    if (topWindow === this) return;
    topWindow = this;
    const stack: PopWindow[] = [this];
    for (let i = 0; i < stack.length; i++) stack.push(...windows().filter((w) => w.parentWin === stack[i]));
    for (const w of stack) {
      w.hidePopover();
      w.showPopover();
    }
  }

  drag(e: PointerEvent): void {
    const bar = e.target instanceof Element ? e.target.closest<HTMLElement>(".popbar") : null;
    if (!bar) return;
    e.preventDefault();
    this.setPinned(true);
    const r = this.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    bar.setPointerCapture(e.pointerId);
    const moves = new AbortController();
    const { signal } = moves;
    bar.addEventListener("pointermove", (m) => {
      this.style.left = `${m.clientX - dx}px`;
      this.style.top = `${m.clientY - dy}px`;
    }, { signal });
    bar.addEventListener("pointerup", () => moves.abort(), { signal });
    bar.addEventListener("pointercancel", () => moves.abort(), { signal });
  }

  close(): void {
    if (!this.isConnected) return;
    for (const w of windows()) if (w.parentWin === this) w.close();
    this.link?.style.removeProperty("anchor-name");
    if (topWindow === this) topWindow = undefined;
    // After a tap outside a sheet, the focus is already on the page body.
    const active = document.activeElement;
    if (this.contains(active) || (this.sheet && active === document.body)) this.link?.focus({ preventScroll: true });
    this.remove();
  }
}

customElements.define("pop-window", PopWindow);

let sweepTimer: number | undefined;

function sweep(): void {
  for (const w of windows().reverse()) {
    if (w.pinned || w.sheet || !w.isConnected) continue;
    const hovered = w.matches(":hover") || w.matches(":focus-within") || w.link?.matches(":hover") || windows().some((c) => c.parentWin === w);
    if (!hovered) w.close();
  }
}

export function scheduleSweep(): void {
  clearTimeout(sweepTimer);
  sweepTimer = setTimeout(sweep, SWEEP_DELAY);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") for (const w of windows().reverse()) if (!w.pinned) w.close();
});
