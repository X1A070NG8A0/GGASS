// frame.tsx - the frame around each page: header, nav, contents, footer and page tools
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

import { frame, raw, type TocEntry } from "ggass";

const target = (href: string): string => {
  const path = href.split(/[?#]/)[0];
  return path.endsWith("/") ? `${path}index.html` : path;
};

const isCurrent = (href: string, url: string): boolean => target(href) === url || (href.endsWith("/") && url.startsWith(href));

// h3 entries go under the h2 before them.
function Contents({ entries }: { entries: TocEntry[] }) {
  const items: { entry: TocEntry; children: TocEntry[] }[] = [];
  for (const entry of entries) {
    const last = items.at(-1);
    if (entry.level === 3 && last?.entry.level === 2) last.children.push(entry);
    else items.push({ entry, children: [] });
  }
  const link = (e: TocEntry) => <a href={`#${e.id}`}>{e.text}</a>;
  return (
    <ol>
      {items.map(({ entry, children }) => (
        <li>
          {link(entry)}
          {children.length > 0 && <ol>{children.map((c) => <li>{link(c)}</li>)}</ol>}
        </li>
      ))}
    </ol>
  );
}

export default frame(({ page, toc, body, head }, { config }) => {
  const hasToc = toc.length > 0;
  return (
    <>
      {raw("<!doctype html>\n")}
      <html lang={config.lang} data-sw={config.offline ? "/sw.js" : undefined}>
        {"\n"}
        <head>
          {"\n"}
          <meta charset="utf-8" />
          {"\n"}
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          {"\n"}
          <title>{page.url === "/index.html" ? config.name : `${page.title} · ${config.name}`}</title>
          {"\n"}
          {head}
          {"\n"}
        </head>
        {"\n"}
        <body>
          {"\n"}
          <a class="skip" href="#main">Skip to content</a>
          {"\n"}
          {config.shortcuts && <key-shortcuts></key-shortcuts>}
          <header class="site">
            <a class="brand" href="/">{config.name}</a>
            <nav aria-label="Site">
              {config.nav.map((n) => (
                <a href={n.href} aria-current={isCurrent(n.href, page.url) ? "page" : undefined}>{n.label}</a>
              ))}
            </nav>
          </header>
          {"\n"}
          <div class={hasToc ? "frame has-toc" : "frame"}>
            {"\n"}
            {hasToc && (
              <nav class="toc" id="toc" aria-labelledby="toc-title" popover>
                <h2 class="toc-title" id="toc-title">Contents</h2>
                <page-toc>
                  <Contents entries={toc} />
                </page-toc>
              </nav>
            )}
            <main id="main">
              {"\n"}
              {body}
              {"\n"}
            </main>
            {"\n"}
          </div>
          {"\n"}
          {config.footer && <footer class="site">{raw(config.footer.trim())}</footer>}
          {"\n"}
          <nav class="dock" aria-label="Page tools">
            {hasToc && <button type="button" popovertarget="toc">Contents</button>}
            <a href="/search.html">Search</a>
            {config.share && <share-button></share-button>}
            <a href="#top">Top</a>
          </nav>
          {"\n"}
        </body>
        {"\n"}
      </html>
      {"\n"}
    </>
  );
});
