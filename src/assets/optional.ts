// optional.ts - loads the optional packages
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

// The site folder comes first, because a linked GGASS (a file: dependency)
// cannot see the packages of the site from its own folder.
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import type * as Esbuild from "esbuild";
import type { Engine } from "../config.ts";
import { slashes } from "../steps.ts";

const loaded = new Map<string, Promise<unknown>>();

async function load(name: string, root: string): Promise<unknown> {
  try {
    const path = createRequire(join(root, "package.json")).resolve(name);
    const mod = (await import(pathToFileURL(path).href)) as { default?: unknown };
    return mod.default ?? mod;
  } catch {
    // Not in the site. Try the GGASS folder.
  }
  try {
    const mod = (await import(name)) as { default?: unknown };
    return mod.default ?? mod;
  } catch {
    return undefined;
  }
}

export function optional<T>(name: string, root: string): Promise<T | undefined> {
  const key = `${root}\0${name}`;
  let mod = loaded.get(key);
  if (!mod) {
    mod = load(name, root);
    loaded.set(key, mod);
  }
  return mod as Promise<T | undefined>;
}

// The package for an engine choice. "builtin" gives undefined. A named
// engine that is not installed adds an error.
export async function engine<T>(name: string, choice: Engine, root: string, purpose: string, errors: string[]): Promise<T | undefined> {
  if (choice === "builtin") return undefined;
  const mod = await optional<T>(name, root);
  if (!mod && choice !== "auto") errors.push(`${purpose} needs ${name}. Install it in the site: npm install --save-dev ${name}`);
  return mod;
}

// The package, or an error that says how to install it.
export async function required<T>(name: string, root: string, purpose: string): Promise<T> {
  const mod = await optional<T>(name, root);
  if (!mod) throw new Error(`${purpose} needs ${name}. Install it in the site: npm install --save-dev ${name}`);
  return mod;
}

export function esbuildErrors(e: unknown, root: string): string[] {
  const list = (e as Partial<Esbuild.BuildFailure> | undefined)?.errors;
  if (!list?.length) return [String(e)];
  return list.map((m) => (m.location ? `${slashes(relative(root, m.location.file))}:${m.location.line}:${m.location.column + 1}: ${m.text}` : m.text));
}
