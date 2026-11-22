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

const URL_ATTRIBUTE = /(\s(?:href|src|action|formaction|poster|cite|data|data-pop|data-sw)=["'])(\/(?!\/))/g;
const SRCSET_ATTRIBUTE = /(\s(?:srcset|imagesrcset)=)(["'])(.*?)\2/g;

// Puts the base path in front of each root address in the URL attributes,
// so that href="/guide/" becomes href="/my-site/guide/".
export function withBasePath(html: string, basePath: string): string {
  if (!basePath) return html;
  const add = (url: string) => (url.startsWith("/") && !url.startsWith("//") ? basePath + url : url);
  return html
    .replace(URL_ATTRIBUTE, (_, attribute: string, slash: string) => attribute + basePath + slash)
    .replace(SRCSET_ATTRIBUTE, (_, attribute: string, quote: string, list: string) => {
      const candidates = list.split(",").map((c) => c.replace(/^(\s*)(\S+)/, (_m, space: string, url: string) => space + add(url)));
      return `${attribute}${quote}${candidates.join(",")}${quote}`;
    });
}

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", shy: "",
  mdash: "—", ndash: "–", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»",
  bull: "•", middot: "·", times: "×", divide: "÷", deg: "°", plusmn: "±", micro: "µ", frac12: "½", frac14: "¼", frac34: "¾",
  copy: "©", reg: "®", trade: "™", sect: "§", para: "¶", larr: "←", rarr: "→", uarr: "↑", darr: "↓",
};

// One pass, so that the text "&amp;lt;" becomes "&lt;", not "<". A name that
// the table does not know stays as it is.
const decodeEntities = (s: string): string =>
  s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z][a-z0-9]*));/gi, (all, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
    if (name) return NAMED[name] ?? all;
    const code = dec ? Number(dec) : parseInt(hex!, 16);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : all;
  });

export const textOf = (html: string): string =>
  decodeEntities(html.replace(/<(script|style)\b[\s\S]*?<\/\1>|<[^>]+>/g, " "))
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
