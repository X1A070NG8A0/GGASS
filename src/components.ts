// components.ts - finds the components of GGASS and of the site
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

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ResolvedConfig } from "./config.ts";

// A component is a group of files with the same name. Each file is optional:
// <tag>.tsx (the schema and the HTML that the build writes), <tag>.css and
// <tag>.client.ts (the browser code).
export type Component = { tag: string; tsx?: string; css?: string; client?: string };

export const GGASS_COMPONENTS = join(import.meta.dirname, "..", "component");

export const isTagName = (name: string): boolean => /^[a-z][a-z0-9]*-[a-z0-9-]*$/.test(name);

function scan(dir: string, errors: string[], label: string): Map<string, Component> {
  const found = new Map<string, Component>();
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // Subfolders hold helpers, and tsconfig.json holds the type settings.
    if (!entry.isFile() || entry.name === "tsconfig.json") continue;
    const m = entry.name.match(/^(.+?)(\.client\.ts|\.tsx|\.css)$/);
    if (!m) {
      errors.push(`${label}/${entry.name}: a component file is <tag>.tsx, <tag>.css or <tag>.client.ts`);
      continue;
    }
    const [, tag, kind] = m;
    if (!isTagName(tag)) {
      errors.push(`${label}/${entry.name}: "${tag}" is not a custom element name (lower case, with a hyphen)`);
      continue;
    }
    const c = found.get(tag) ?? { tag };
    const path = join(dir, entry.name);
    if (kind === ".tsx") c.tsx = path;
    else if (kind === ".css") c.css = path;
    else c.client = path;
    found.set(tag, c);
  }
  return found;
}

// A site component replaces the GGASS component of the same name, with all
// of its files.
export function findComponents(config: ResolvedConfig, errors: string[]): Map<string, Component> {
  const all = scan(GGASS_COMPONENTS, errors, "ggass/component");
  for (const [tag, c] of scan(config.component, errors, "component")) all.set(tag, c);
  return all;
}
