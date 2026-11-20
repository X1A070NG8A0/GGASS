// content.ts - loads the pages in the content folder
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

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import YAML from "yaml";
import type { ResolvedConfig } from "./config.ts";
import { slashes } from "./steps.ts";

export type TocEntry = { level: number; id: string; text: string };

export type Page = {
  url: string;
  title: string;
  kind: string;
  body: string;
  file: string;
  toc: TocEntry[];
};

export type Content = { pages: Map<string, Page>; files: string[]; errors: string[] };

// YAML reads `title: 2026` as a number, so a number or true/false is text.
const yamlText = (value: unknown): string =>
  typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : "";

export function loadContent(config: ResolvedConfig): Content {
  const errors: string[] = [];
  if (!config.name) errors.push("configuration: no site name");
  const pages = new Map<string, Page>();
  const files: string[] = [];
  let rels: string[];
  try {
    rels = readdirSync(config.content, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => relative(config.content, join(d.parentPath, d.name)))
      .sort();
  } catch {
    errors.push(`${config.content}: the content folder does not exist`);
    return { pages, files, errors };
  }
  const base = slashes(relative(config.root, config.content));
  for (const rel of rels) {
    const url = "/" + slashes(rel);
    if (!rel.endsWith(".html")) {
      files.push(url);
      continue;
    }
    const file = `${base}${url}`;
    const m = readFileSync(join(config.content, rel), "utf8").replace(/\r\n/g, "\n").match(/^<!--\n([\s\S]*?)\n-->\n?([\s\S]*)$/);
    if (!m) {
      errors.push(`${file}: no page header (YAML between "<!--" and "-->" lines at the start)`);
      continue;
    }
    let head: { title?: unknown; kind?: unknown };
    try {
      head = (YAML.parse(m[1]) as typeof head | null) ?? {};
    } catch (e) {
      errors.push(`${file}: YAML header: ${(e as Error).message.split("\n")[0]}`);
      continue;
    }
    const title = yamlText(head.title);
    if (!title) errors.push(`${file}: no title (it must be text)`);
    pages.set(url, { url, title: title || url, kind: yamlText(head.kind) || "Page", body: m[2].trim(), file, toc: [] });
  }
  return { pages, files, errors };
}
