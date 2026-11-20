// build.ts - the build pipeline
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

// The build: loads the pages, transforms them, checks the links, processes
// the assets, puts each page in the layout and writes the output folder.
//
// A site calls it from its own build script:
//
//   import { build } from "ggass";
//   await build({ name: "My site", nav: [{ href: "/guide/", label: "Guide" }] });
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildCss } from "./assets/css.ts";
import { buildFonts } from "./assets/fonts.ts";
import { pageImages } from "./assets/images.ts";
import { buildJs, buildServiceWorker, type Scripts } from "./assets/js.ts";
import { resolveConfig, type SiteConfig } from "./config.ts";
import { loadContent, type Page } from "./content.ts";
import { layout, target, textOf } from "./html.ts";
import { Timings, type Asset, type BuildContext } from "./steps.ts";
import { customTags, headings, popups, sideNotes } from "./transform.ts";

export type BuildOptions = {
  // Check the pages and links only. Write nothing.
  check?: boolean;
  // Print nothing.
  quiet?: boolean;
};

export type BuildResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  pages: number;
  // The paths written, relative to the output folder.
  outputs: string[];
  timings: [string, number][];
};

const GENERATED = new Set(["/search.html", "/search-index.json", "/sw.js"]);

const searchPage = `<h1>Search</h1>
<site-search><label class="field" for="search-q">Search this site</label><input type="search" id="search-q" name="q" autofocus><ol class="results"></ol></site-search>
<noscript><p>Search needs JavaScript. Without it, start from the <a href="/">home page</a>.</p></noscript>`;

// The text of a page for search and font subsets, without the print copy of
// the notes and without the note numbers.
const pageText = (page: Page) =>
  textOf(page.body.replace(/<section class="endnotes"[\s\S]*?<\/section>/, "").replace(/<a class="note-(?:ref|num)"[^>]*>\d+<\/a>/g, ""));

function importMap(js: Scripts): string {
  const map = {
    imports: Object.fromEntries([...js.modules].map(([tag, a]) => [`ggass/${tag}`, a.url])),
    integrity: Object.fromEntries(js.files.map((f) => [f.url, f.integrity])),
  };
  return `<script type="importmap">${JSON.stringify(map)}</script>`;
}

export async function build(site: SiteConfig, options: BuildOptions = {}): Promise<BuildResult> {
  const started = performance.now();
  const config = resolveConfig(site);
  const timings = new Timings();
  const log = options.quiet ? () => {} : (s: string) => console.log(s);
  const { pages, files, errors } = await timings.run("load", () => loadContent(config));
  const warnings: string[] = [];
  const outputs = new Map<string, string | Uint8Array>();
  const ctx: BuildContext = {
    config,
    pages,
    files,
    errors,
    warnings,
    outputs,
    head: [],
    emit: (path, data) => void outputs.set(path.replace(/\\/g, "/").replace(/^\/+/, ""), data),
  };
  const finish = (ok: boolean): BuildResult => {
    if (warnings.length) {
      log(`Warnings (${warnings.length}):`);
      for (const w of warnings) log(`  - ${w}`);
    }
    if (!ok) {
      console.error(`Build failed: ${errors.length} error(s):`);
      for (const e of errors) console.error(`  - ${e}`);
      process.exitCode = 1;
    }
    return { ok, errors, warnings, pages: pages.size, outputs: [...outputs.keys()].sort(), timings: timings.list };
  };

  // ---------- pages ----------
  const popTargets = new Set<string>();
  await timings.run("pages", () => {
    for (const page of pages.values()) {
      headings(page);
      popups(page, pages, errors, popTargets);
      sideNotes(page, errors);
    }
  });
  await timings.run("images", () => pageImages(ctx));
  for (const step of config.steps) {
    const hook = step.page;
    if (hook) await timings.run(step.name, async () => {
      for (const page of pages.values()) page.body = await hook(page.body, page, ctx);
    });
  }

  // ---------- links ----------
  // Each root-relative link must open a page, a generated file, an asset or
  // a file from the content folder.
  await timings.run("links", () => {
    const known = (href: string) => {
      const t = target(href);
      return pages.has(t) || GENERATED.has(t) || files.includes(t) || outputs.has(t.slice(1)) || t.startsWith("/assets/");
    };
    for (const n of config.nav) if (n.href.startsWith("/") && !known(n.href)) errors.push(`configuration: nav link "${n.href}" has no target`);
    for (const page of pages.values())
      for (const [, href] of page.body.matchAll(/\s(?:href|src|action)="(\/(?!\/)[^"]*)"/g))
        if (!known(href)) errors.push(`${page.file}: link to "${href}" has no target`);
  });
  if (options.check) {
    log(`Checked ${pages.size} pages: ${errors.length} error(s).`);
    return finish(errors.length === 0);
  }
  if (errors.length) return finish(false);

  // ---------- assets ----------
  const texts = new Map([...pages.values()].map((p) => [p.url, pageText(p)]));
  const siteText = [config.name, config.footer, ...config.nav.map((n) => n.label), ...[...pages.values()].map((p) => p.title), ...texts.values()].join(" ");
  const fonts = await timings.run("fonts", () => buildFonts(ctx, textOf(siteText)));
  const css = await timings.run("css", () => buildCss(ctx, fonts.css));
  const js = await timings.run("js", () => buildJs(ctx));
  for (const step of config.steps) {
    const hook = step.site;
    if (hook) await timings.run(step.name, () => hook(ctx));
  }
  if (errors.length || !js) return finish(false);

  // ---------- layout ----------
  await timings.run("layout", () => {
    const shared = [
      ...fonts.preloads,
      css ? `<link rel="stylesheet" href="${css.url}" integrity="${css.integrity}">` : "",
      importMap(js),
    ].filter(Boolean);
    const loader = `<script type="module" src="${js.loader.url}" integrity="${js.loader.integrity}"></script>`;
    // modulepreload links for the modules of the elements on the page and
    // their static imports, so the browser fetches them all at once.
    const preloads = (html: string) => {
      const seen = new Set<string>();
      const add = (url: string) => {
        if (seen.has(url)) return;
        seen.add(url);
        for (const dep of js.imports.get(url) ?? []) add(dep);
      };
      add(js.loader.url);
      for (const t of customTags(html)) {
        const m = js.modules.get(t);
        if (m) add(m.url);
      }
      seen.delete(js.loader.url);
      const sums = new Map(js.files.map((f) => [f.url, f.integrity]));
      return [...seen].map((url) => `<link rel="modulepreload" href="${url}" integrity="${sums.get(url)}">`);
    };
    const render = (url: string, title: string, toc: Page["toc"], body: string) => {
      const html = layout({ config, url, title, toc, body, head: "<!--head-->" });
      const head = [...shared, ...preloads(html), loader, ...ctx.head].join("\n");
      return html.replace("<!--head-->", head);
    };
    for (const page of pages.values()) {
      ctx.emit(page.url, render(page.url, page.title, page.toc, page.body));
      if (popTargets.has(page.url)) ctx.emit(`frag${page.url}`, page.body);
    }
    ctx.emit("search.html", render("/search.html", "Search", [], searchPage));
    ctx.emit("search-index.json", JSON.stringify([...pages.values()].map((p) => ({ k: p.kind, t: p.title, x: texts.get(p.url), u: p.url }))));
  });

  // ---------- service worker ----------
  if (config.offline) {
    const assets: Asset[] = [...(css ? [css] : []), ...js.files];
    const precache = ["/", "/search.html", "/search-index.json", ...assets.map((a) => a.url), ...[...outputs.keys()].filter((k) => k.startsWith("assets/fonts/")).map((k) => `/${k}`)];
    await timings.run("offline", () => buildServiceWorker(ctx, precache));
  }

  // ---------- write ----------
  await timings.run("write", () => {
    rmSync(config.out, { recursive: true, force: true });
    for (const [rel, data] of outputs) {
      const path = join(config.out, rel);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, data);
    }
    for (const f of files) {
      const to = join(config.out, f.slice(1));
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(join(config.content, f.slice(1)), to);
    }
  });
  const total = performance.now() - started;
  log(`Built ${pages.size} pages and ${outputs.size + files.length - pages.size} other files in ${total < 1000 ? `${total.toFixed(0)} ms` : `${(total / 1000).toFixed(2)} s`} (${timings.report()}).`);
  return finish(true);
}

