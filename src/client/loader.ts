// loader.ts - loads the module of each custom element on the page
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

// The one script that each page loads. It finds the custom elements that are
// not defined yet and loads the module for each one. The import map of the
// page names the modules ("ggass/check-list") and holds their integrity
// values. The loader watches the page, so elements that arrive later (in a
// popup window or a swapped tab) also start. Each element holds plain HTML
// that works without JavaScript, so a module that fails to load breaks
// nothing.

const asked = new Set<string>();

function load(root: Element | Document): void {
  const found = [...root.querySelectorAll(":not(:defined)")];
  if (root instanceof Element && root.matches(":not(:defined)")) found.push(root);
  for (const el of found) {
    const tag = el.localName;
    if (asked.has(tag)) continue;
    asked.add(tag);
    let url: string;
    try {
      // The import map maps the name. A name that it does not map throws.
      url = import.meta.resolve(`ggass/${tag}`);
    } catch {
      continue;
    }
    import(url).catch((e: unknown) => console.error(`GGASS: the module for <${tag}> did not load`, e));
  }
}

load(document);
new MutationObserver((records) => {
  for (const r of records) for (const node of r.addedNodes) if (node instanceof Element) load(node);
}).observe(document.documentElement, { childList: true, subtree: true });

// Offline reading, if the site turns it on.
const worker = document.documentElement.dataset.sw;
if (worker && "serviceWorker" in navigator) {
  navigator.serviceWorker.register(worker).catch((e: unknown) => console.error("GGASS: the service worker did not start", e));
}
