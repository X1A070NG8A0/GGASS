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

const requestedTags = new Set<string>();

function loadUndefined(root: Element | Document): void {
  const found = [...root.querySelectorAll(":not(:defined)")];
  if (root instanceof Element && root.matches(":not(:defined)")) found.push(root);
  for (const el of found) {
    const tag = el.localName;
    if (requestedTags.has(tag)) continue;
    requestedTags.add(tag);
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

loadUndefined(document);
new MutationObserver((records) => {
  for (const r of records) for (const node of r.addedNodes) if (node instanceof Element) loadUndefined(node);
}).observe(document.documentElement, { childList: true, subtree: true });

const worker = document.documentElement.dataset.sw;
if (worker && "serviceWorker" in navigator) {
  navigator.serviceWorker.register(worker).catch((e: unknown) => console.error("GGASS: the service worker did not start", e));
}
