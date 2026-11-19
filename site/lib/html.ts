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

// Small HTML helpers shared by the page builders.
import type { Site } from "./content.ts";

export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// The page that a root-relative link opens: no query or fragment, and a
// folder link ("/guide/") opens its index.html.
export const target = (href: string): string => {
  const path = href.split(/[?#]/)[0];
  return path.endsWith("/") ? `${path}index.html` : path;
};

// A nav link is current on its own page, and a folder link ("/guide/") is
// current on each page in that folder.
const isCurrent = (href: string, url: string): boolean => target(href) === url || (href.endsWith("/") && url.startsWith(href));

export function layout(site: Site, url: string, title: string, body: string): string {
  const nav = site.nav.map((n) => `<a href="${esc(n.href)}"${isCurrent(n.href, url) ? ' aria-current="page"' : ""}>${esc(n.label)}</a>`).join("\n    ");
  return `<!doctype html>
<html lang="${esc(site.lang ?? "en")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${url === "/index.html" ? esc(site.name) : `${esc(title)} · ${esc(site.name)}`}</title>
<link rel="stylesheet" href="/assets/style.css">
<script src="/assets/main.js" type="module"></script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site">
  <a class="brand" href="/">${esc(site.name)}</a>
  <nav>
    ${nav}
  </nav>
</header>
<main id="main">
${body}
</main>
${site.footer ? `<footer class="site">\n  ${site.footer.trim()}\n</footer>\n` : ""}</body>
</html>
`;
}
