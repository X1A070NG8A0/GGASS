// html.ts - HTML helpers
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

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const esc = (s: unknown): string => String(s ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c]);

export const target = (href: string): string => {
  const path = href.split(/[?#]/)[0];
  return path.endsWith("/") ? `${path}index.html` : path;
};

// &amp; must be decoded last, or the text "&amp;lt;" becomes "<".
export const textOf = (html: string): string =>
  html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>|<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

export const slug = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";

export function attrs(tag: string): Map<string, string> {
  const out = new Map<string, string>();
  const inner = tag.replace(/^<[\w-]+/, "").replace(/\/?>$/, "");
  for (const m of inner.matchAll(/([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g))
    out.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}

export function tag(name: string, list: Map<string, string>): string {
  const parts = [...list].map(([k, v]) => (v === "" ? ` ${k}` : ` ${k}="${esc(v)}"`));
  return `<${name}${parts.join("")}>`;
}
