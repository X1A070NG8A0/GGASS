// html.ts - HTML helpers and the page layout
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

// HTML helpers and the page layout.
import type { ResolvedConfig } from "./config.ts";
import type { TocEntry } from "./content.ts";

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const esc = (s: unknown): string => String(s ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c]);

// The page that a root-relative link opens: no query or fragment, and a
// folder link ("/guide/") opens its index.html.
export const target = (href: string): string => {
  const path = href.split(/[?#]/)[0];
  return path.endsWith("/") ? `${path}index.html` : path;
};

// The plain text of an HTML fragment. &amp; is decoded last, so that the
// text "&amp;lt;" stays "&lt;".
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

// An ID from heading text: lower case, words joined by hyphens.
export const slug = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";

// The attributes of a start tag, such as `<img src="a.png" alt="A" hidden>`.
export function attrs(tag: string): Map<string, string> {
  const out = new Map<string, string>();
  const inner = tag.replace(/^<[\w-]+/, "").replace(/\/?>$/, "");
  for (const m of inner.matchAll(/([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g))
    out.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}

// A start tag from a name and attributes. An empty value writes a bare
// attribute, such as `hidden`.
export function tag(name: string, list: Map<string, string>): string {
  const parts = [...list].map(([k, v]) => (v === "" ? ` ${k}` : ` ${k}="${esc(v)}"`));
  return `<${name}${parts.join("")}>`;
}

// The table of contents: h2 entries, with their h3 entries in a nested list.
function tocList(entries: TocEntry[]): string {
  // An h3 goes under the h2 before it. An h3 before the first h2 is a top item.
  const items: { entry: TocEntry; children: TocEntry[] }[] = [];
  for (const entry of entries) {
    const last = items.at(-1);
    if (entry.level === 3 && last?.entry.level === 2) last.children.push(entry);
    else items.push({ entry, children: [] });
  }
  const link = (e: TocEntry) => `<a href="#${esc(e.id)}">${esc(e.text)}</a>`;
  const item = ({ entry, children }: (typeof items)[number]) =>
    `<li>${link(entry)}${children.length ? `<ol>${children.map((c) => `<li>${link(c)}</li>`).join("")}</ol>` : ""}</li>`;
  return `<ol>${items.map(item).join("")}</ol>`;
}

// A nav link is current on its own page, and a folder link ("/guide/") is
// current on each page in that folder.
const isCurrent = (href: string, url: string): boolean => target(href) === url || (href.endsWith("/") && url.startsWith(href));

export type LayoutInput = {
  config: ResolvedConfig;
  url: string;
  title: string;
  toc: TocEntry[];
  body: string;
  // The stylesheet, scripts and other tags for the <head>.
  head: string;
};

// The page frame. On a wide screen: the table of contents, the text and a
// margin for side notes. On a narrow screen: one column. On a phone or a
// tablet, the page tools are in a bar at the bottom, in reach of the thumb.
// The stylesheet chooses.
export function layout({ config, url, title, toc, body, head }: LayoutInput): string {
  const nav = config.nav.map((n) => `<a href="${esc(n.href)}"${isCurrent(n.href, url) ? ' aria-current="page"' : ""}>${esc(n.label)}</a>`).join("\n    ");
  const contents = toc.length
    ? `<nav class="toc" id="toc" aria-labelledby="toc-title" popover>
<h2 class="toc-title" id="toc-title">Contents</h2>
<page-toc>${tocList(toc)}</page-toc>
</nav>
`
    : "";
  const tools = [
    toc.length ? `<button type="button" popovertarget="toc">Contents</button>` : "",
    `<a href="/search.html">Search</a>`,
    config.share ? "<share-button></share-button>" : "",
    `<a href="#top">Top</a>`,
  ].filter(Boolean);
  return `<!doctype html>
<html lang="${esc(config.lang)}"${config.offline ? ' data-sw="/sw.js"' : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${url === "/index.html" ? esc(config.name) : `${esc(title)} · ${esc(config.name)}`}</title>
${head}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${config.shortcuts ? "<key-shortcuts></key-shortcuts>\n" : ""}<header class="site">
  <a class="brand" href="/">${esc(config.name)}</a>
  <nav aria-label="Site">
    ${nav}
  </nav>
</header>
<div class="frame${toc.length ? " has-toc" : ""}">
${contents}<main id="main">
${body}
</main>
</div>
${config.footer ? `<footer class="site">\n  ${config.footer.trim()}\n</footer>\n` : ""}<nav class="dock" aria-label="Page tools">
  ${tools.join("\n  ")}
</nav>
</body>
</html>
`;
}
