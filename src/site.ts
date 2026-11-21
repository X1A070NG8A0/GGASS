// site.ts - the site object that templates read, and the record of what each page reads
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

import type { ResolvedConfig } from "./config.ts";
import { target } from "./html.ts";
import type { RawPage } from "./pagedefs.ts";
import type { AnyPage, Site } from "./templates.ts";

// Each read goes into the record as "data:<name>", "page:<address>" or
// "pages:*". A watch build renders a page again only if something that it
// read changed.
export function makeSite(
  config: ResolvedConfig,
  data: Record<string, unknown>,
  pages: Map<string, AnyPage>,
  raw: Map<string, RawPage>,
  record: (dependency: string) => void,
): Site {
  const tracked = new Proxy(data, {
    get(t, k) {
      if (typeof k === "string") record(`data:${k}`);
      return Reflect.get(t, k);
    },
    has(t, k) {
      if (typeof k === "string") record(`data:${k}`);
      return Reflect.has(t, k);
    },
    ownKeys(t) {
      record("data:*");
      return Reflect.ownKeys(t);
    },
  });
  const get = (url: string) => {
    record(`page:${url}`);
    return pages.get(url);
  };
  return {
    config,
    data: tracked,
    page: (address) => get(target(address)),
    pages: () => {
      record("pages:*");
      return [...pages.values()];
    },
    children: (page) => (raw.get(page.url)?.children ?? []).map(get).filter((p): p is AnyPage => !!p),
    parent: (page) => {
      const url = raw.get(page.url)?.parent;
      return url ? get(url) : undefined;
    },
  };
}

// Templates get shared values, so nothing may change them.
export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value && typeof value === "object" && !seen.has(value)) {
    seen.add(value);
    for (const v of Object.values(value)) deepFreeze(v, seen);
    Object.freeze(value);
  }
  return value;
}
