// sw.ts - the service worker for offline reading
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

// The build writes PRECACHE and VERSION before this code.

declare const PRECACHE: string[];
declare const VERSION: string;

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => sw.skipWaiting()));
});

sw.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("ggass-") && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

const OFFLINE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline</title><p>You are offline, and this page is not saved on this device. <a href="/">Open the home page</a>.</p>`;

async function pageFirst(request: Request): Promise<Response> {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) void cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) ?? new Response(OFFLINE, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
  }
}

async function cacheFirst(request: Request): Promise<Response> {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) void cache.put(request, response.clone());
  return response;
}

sw.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // /__ggass/ is the reload channel of the local server.
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/__ggass/")) return;
  e.respondWith(url.pathname.startsWith("/assets/") ? cacheFirst(e.request) : pageFirst(e.request));
});
