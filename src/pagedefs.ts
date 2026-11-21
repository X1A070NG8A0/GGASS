// pagedefs.ts - loads pagedef/, data/ and static/
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

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import YAML, { LineCounter, type Document } from "yaml";
import { shortHash } from "./assets/hash.ts";
import type { ResolvedConfig } from "./config.ts";
import type { Path } from "./schema.ts";
import { slashes } from "./steps.ts";

// A page before the check against its template.
export type RawPage = {
  url: string;
  // The file for messages, for example "pagedef/book/ch03.yaml:40".
  file: string;
  values: Record<string, unknown>;
  where(path: Path): string;
  version: string;
  parent?: string;
  children: string[];
  // Made by GGASS, not by a pagedef. Not in the search index.
  generated?: boolean;
};

type Parsed = { mtimeMs: number; size: number; text: string; doc: Document; lines: LineCounter; value: unknown; error?: string };

// Parsed YAML files by path. A watch build parses again only the files that
// changed.
export type ParseCache = Map<string, Parsed>;

function parse(path: string, cache: ParseCache): Parsed {
  const st = statSync(path);
  const hit = cache.get(path);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit;
  const text = readFileSync(path, "utf8");
  const lines = new LineCounter();
  const doc = YAML.parseDocument(text, { lineCounter: lines, prettyErrors: false });
  const first = doc.errors[0];
  const parsed: Parsed = {
    mtimeMs: st.mtimeMs,
    size: st.size,
    text,
    doc,
    lines,
    value: first ? undefined : doc.toJS(),
    error: first ? `${first.linePos ? `${first.linePos[0].line}: ` : ""}${first.message.split("\n")[0]}` : undefined,
  };
  cache.set(path, parsed);
  return parsed;
}

// The line of the YAML node at a path, or of the nearest node above it.
function lineAt(p: Parsed, path: Path): number | undefined {
  for (let at = path; ; at = at.slice(0, -1)) {
    const node = (at.length ? p.doc.getIn(at, true) : p.doc.contents) as { range?: [number, number, number] } | undefined;
    if (node?.range) return p.lines.linePos(node.range[0]).line;
    if (!at.length) return undefined;
  }
}

function walk(dir: string): string[] {
  try {
    return readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => join(d.parentPath, d.name))
      .sort();
  } catch {
    return [];
  }
}

const isMap = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function addressOf(rel: string): string {
  const stem = rel.replace(/\.yaml$/, "");
  return basename(stem) === "index" ? `/${stem.slice(0, -"index".length)}index.html` : `/${stem}.html`;
}

// /book/ch03.html → /book/ch03/<id>.html, and /book/index.html → /book/<id>.html
export const childAddress = (parent: string, id: string): string => `${parent.replace(/(?:index)?\.html$/, "").replace(/([^/])$/, "$1/")}${id}.html`;

export function loadPagedefs(config: ResolvedConfig, cache: ParseCache, errors: string[]): Map<string, RawPage> {
  const pages = new Map<string, RawPage>();
  const show = (path: string) => slashes(relative(config.root, path));
  const files = walk(config.pagedef);
  const defaults = new Map<string, Parsed>();
  for (const path of files) {
    if (basename(path) !== "_defaults.yaml") continue;
    const p = parse(path, cache);
    if (p.error) errors.push(`${show(path)}:${p.error}`);
    else if (p.value !== null && !isMap(p.value)) errors.push(`${show(path)}: must be a map of keys`);
    else defaults.set(dirname(path), p);
  }

  const add = (page: RawPage) => {
    const other = pages.get(page.url);
    if (other) errors.push(`${page.file}: the address ${page.url} is taken already by ${other.file}`);
    else pages.set(page.url, page);
  };

  // Child pages come from the `pages` key, and can have children too.
  const addChildren = (parent: RawPage) => {
    const list = parent.values.pages;
    if (list === undefined || list === null) return;
    if (!Array.isArray(list)) {
      errors.push(`${parent.where(["pages"])}: pages must be a list of child pages`);
      return;
    }
    list.forEach((child: unknown, i) => {
      const at = (path: Path) => parent.where(["pages", i, ...path]);
      if (!isMap(child)) return void errors.push(`${at([])}: each child page must be a map of keys`);
      const id = typeof child.id === "number" ? String(child.id) : child.id;
      if (typeof id !== "string" || !/^[\w.-]+$/.test(id)) return void errors.push(`${at(["id"])}: a child page needs an id of letters, digits, "-", "_" or "."`);
      const page: RawPage = { url: childAddress(parent.url, id), file: at([]), values: { ...child, id }, where: at, version: parent.version, parent: parent.url, children: [] };
      parent.children.push(page.url);
      add(page);
      addChildren(page);
    });
  };

  for (const path of files) {
    const name = basename(path);
    const rel = slashes(relative(config.pagedef, path));
    if (name === "_defaults.yaml") continue;
    if (name.endsWith(".yml")) {
      errors.push(`${show(path)}: GGASS reads .yaml files only. Rename it to .yaml.`);
      continue;
    }
    if (!name.endsWith(".yaml")) {
      errors.push(`${show(path)}: pagedef/ holds YAML files only. Put other files in static/.`);
      continue;
    }
    if (name.startsWith("_")) {
      errors.push(`${show(path)}: a name that starts with "_" is kept for _defaults.yaml`);
      continue;
    }
    const own = parse(path, cache);
    if (own.error) {
      errors.push(`${show(path)}:${own.error}`);
      continue;
    }
    if (!isMap(own.value)) {
      errors.push(`${show(path)}: a pagedef must be a map of keys`);
      continue;
    }
    // The nearest _defaults.yaml wins key by key, and the page wins over all.
    const chain: { p: Parsed; file: string }[] = [];
    for (let dir = dirname(path); ; dir = dirname(dir)) {
      const d = defaults.get(dir);
      if (d) chain.unshift({ p: d, file: show(join(dir, "_defaults.yaml")) });
      if (dir === config.pagedef || dirname(dir) === dir) break;
    }
    const values: Record<string, unknown> = {};
    const source = new Map<string, { p: Parsed; file: string }>();
    for (const d of chain) {
      for (const [k, v] of Object.entries((d.p.value as Record<string, unknown> | null) ?? {})) {
        values[k] = v;
        source.set(k, d);
      }
    }
    for (const [k, v] of Object.entries(own.value)) {
      values[k] = v;
      source.delete(k);
    }
    const file = show(path);
    const where = (p: Path) => {
      const from = typeof p[0] === "string" ? source.get(p[0]) : undefined;
      const line = lineAt(from?.p ?? own, p);
      return `${from?.file ?? file}${line ? `:${line}` : ""}`;
    };
    const page: RawPage = { url: addressOf(rel), file, values, where, version: shortHash(own.text, ...chain.map((d) => d.p.text)), children: [] };
    add(page);
    addChildren(page);
  }
  return pages;
}

export type Data = { values: Record<string, unknown>; versions: Map<string, string> };

const FOLDER = Symbol("folder");

// data/tools.yaml is values.tools, and data/forum/threads.yaml is
// values.forum.threads. The version of a name covers each file under it.
export function loadData(config: ResolvedConfig, cache: ParseCache, errors: string[]): Data {
  const values: Record<string, unknown> = {};
  const parts = new Map<string, string[]>();
  for (const path of walk(config.data)) {
    const rel = slashes(relative(config.data, path));
    const show = slashes(relative(config.root, path));
    if (rel.endsWith(".yml")) {
      errors.push(`${show}: GGASS reads .yaml files only. Rename it to .yaml.`);
      continue;
    }
    if (!rel.endsWith(".yaml")) {
      errors.push(`${show}: data/ holds YAML files only`);
      continue;
    }
    const p = parse(path, cache);
    if (p.error) {
      errors.push(`${show}:${p.error}`);
      continue;
    }
    const keys = rel.replace(/\.yaml$/, "").split("/");
    // A folder is a map of its files. Files come before subfolders in the
    // walk, so a file and a folder with one name meet here.
    let at: Record<string, unknown> | undefined = values;
    for (const k of keys.slice(0, -1)) {
      at[k] ??= { [FOLDER]: true };
      at = isMap(at[k]) && (at[k] as Record<symbol, unknown>)[FOLDER] ? (at[k] as Record<string, unknown>) : undefined;
      if (!at) break;
    }
    const last = keys.at(-1)!;
    if (!at || at[last] !== undefined) {
      errors.push(`${show}: "${keys.join("/")}" is both a file and a folder in data/`);
      continue;
    }
    at[last] = p.value;
    parts.set(keys[0], [...(parts.get(keys[0]) ?? []), rel, p.text]);
  }
  const versions = new Map([...parts].map(([k, list]) => [k, shortHash(...list)]));
  return { values, versions };
}

export type StaticFile = { url: string; path: string; mtimeMs: number; size: number };

export function listStatic(config: ResolvedConfig): StaticFile[] {
  return walk(config.static).map((path) => {
    const st = statSync(path);
    return { url: `/${slashes(relative(config.static, path))}`, path, mtimeMs: st.mtimeMs, size: st.size };
  });
}
