// build.test.ts - tests of the whole build
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

// Builds the test site twice, with and without the optional packages, and
// checks the output.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { build, integrity, type BuildResult } from "ggass";
import { site } from "./fixture/build.ts";

const temp = mkdtempSync(join(tmpdir(), "ggass-test-"));
after(() => rmSync(temp, { recursive: true, force: true }));

const read = (out: string, rel: string) => readFileSync(join(out, rel), "utf8");

// The integrity value in each tag must match the file it names.
function checkIntegrity(out: string, html: string): number {
  let n = 0;
  for (const m of html.matchAll(/(?:href|src)="(\/assets\/[^"]+)" integrity="([^"]+)"/g)) {
    assert.equal(integrity(readFileSync(join(out, m[1].slice(1)))), m[2], `integrity of ${m[1]}`);
    n++;
  }
  const map = JSON.parse(html.match(/<script type="importmap">(.*?)<\/script>/)![1]) as { imports: Record<string, string>; integrity: Record<string, string> };
  for (const [url, sum] of Object.entries(map.integrity)) {
    assert.equal(integrity(readFileSync(join(out, url.slice(1)))), sum, `import map integrity of ${url}`);
    n++;
  }
  return n;
}

describe("build with esbuild and sharp", () => {
  const out = join(temp, "full");
  let result: BuildResult;
  before(async () => {
    result = await build({ ...site, out }, { quiet: true });
  });

  test("succeeds", () => {
    assert.deepEqual(result.errors, []);
    assert.equal(result.ok, true);
  });

  test("every integrity value matches its file", () => {
    for (const page of ["index.html", "article.html", "elements/index.html", "search.html"]) assert.ok(checkIntegrity(out, read(out, page)) > 5);
  });

  test("bundles, minifies and maps the stylesheet", () => {
    const css = result.outputs.find((o) => /^assets\/style-[0-9a-f]{10}\.css$/.test(o));
    assert.ok(css, "a fingerprinted stylesheet");
    const text = read(out, css);
    assert.ok(text.includes("figure.wide{"), "the site stylesheet and its @import are inlined");
    assert.ok(!text.includes("@import"), "no @import is left");
    assert.ok(text.includes(`sourceMappingURL=${css.split("/")[1]}.map`));
    const map = JSON.parse(read(out, `${css}.map`)) as { sources: string[] };
    assert.ok(map.sources.some((s) => s.endsWith("parts/figures.css")));
  });

  test("loads only the modules of the elements on a page", () => {
    const html = read(out, "article.html");
    const preloads = [...html.matchAll(/rel="modulepreload" href="\/assets\/([a-z-]+)-/g)].map((m) => m[1]);
    for (const tag of ["side-note", "page-toc", "pop-link", "photo-zoom"]) assert.ok(preloads.includes(tag), `preload ${tag}`);
    for (const tag of ["check-list", "section-tabs", "site-search"]) assert.ok(!preloads.includes(tag), `no preload for ${tag}`);
  });

  test("turns side notes into references, margin notes and print notes", () => {
    const html = read(out, "article.html");
    assert.equal([...html.matchAll(/<a class="note-ref" id="note-ref-(\d)"/g)].length, 5);
    assert.ok(html.includes('<side-note id="note-1" role="note"'));
    // The note goes at the end of its paragraph.
    assert.match(html, /see both\.<a class="note-ref"[^>]*>1<\/a><side-note id="note-1"[\s\S]*?<\/side-note><\/p>/);
    assert.match(html, /<section class="endnotes"[\s\S]*<li>A side note\./);
  });

  test("writes a table of contents from the headings", () => {
    const html = read(out, "article.html");
    assert.ok(html.includes('<nav class="toc" id="toc" aria-labelledby="toc-title" popover>'));
    assert.ok(html.includes('<a href="#the-wide-presentation">The wide presentation</a><ol><li><a href="#keyboard-shortcuts">'));
    assert.ok(!html.includes('href="#endnotes-title"'), "the print notes heading is not in the contents");
    assert.ok(html.includes('<button type="button" popovertarget="toc">Contents</button>'));
    assert.ok(!read(out, "index.html").includes('id="toc"'), "a short page has no contents");
  });

  test("processes images and writes responsive copies", () => {
    const html = read(out, "article.html");
    const pictures = [...html.matchAll(/<picture>([\s\S]*?)<\/picture>/g)].map((m) => m[1]);
    assert.equal(pictures.length, 2);
    for (const p of pictures) {
      assert.match(p, /<source type="image\/avif" srcset="[^"]+ 400w, /);
      assert.match(p, /<source type="image\/webp"/);
      assert.match(p, /<img [^>]*width="\d+" height="\d+"/);
    }
    assert.match(pictures[0], /width="1000" height="1000"/, "the 1:1 crop");
    assert.match(pictures[1], /width="1600" height="1000"/, "the original");
    assert.ok(!/<img[^>]*data-image/.test(html), "the operations attribute is gone");
    for (const m of html.matchAll(/\/assets\/img\/[^" ,]+/g)) assert.ok(existsSync(join(out, m[0].slice(1))), m[0]);
  });

  test("writes /frag/ copies only for popup targets", () => {
    assert.ok(result.outputs.includes("frag/elements/index.html"));
    assert.ok(result.outputs.includes("frag/article.html"));
    assert.ok(!result.outputs.includes("frag/index.html"));
  });

  test("writes the service worker with the assets to keep", () => {
    const sw = read(out, "sw.js");
    assert.match(sw, /^const PRECACHE = \[.*"\/assets\/style-[0-9a-f]{10}\.css".*\];\nconst VERSION = "ggass-[0-9a-f]{10}";/);
    assert.ok(read(out, "article.html").includes('data-sw="/sw.js"'));
  });
});

describe("build without the optional packages", () => {
  const out = join(temp, "builtin");
  let result: BuildResult;
  before(async () => {
    result = await build({ ...site, out, css: { ...site.css, engine: "builtin" }, js: { ...site.js, engine: "builtin" }, images: { responsive: false } }, { quiet: true });
  });

  test("succeeds", () => {
    assert.deepEqual(result.errors, []);
  });

  test("every integrity value matches its file", () => {
    assert.ok(checkIntegrity(out, read(out, "article.html")) > 5);
  });

  test("bundles and minifies the stylesheet with the built-in code", () => {
    const css = read(out, result.outputs.find((o) => o.endsWith(".css"))!);
    assert.ok(css.includes("figure.wide{"));
    assert.ok(!css.includes("@import"));
    assert.ok(!/\/\*(?!!)/.test(css), "no comments are left");
  });

  test("strips types and points imports at the hashed files", () => {
    const rel = result.outputs.find((o) => /^assets\/pop-link-[0-9a-f]{10}\.js$/.test(o))!;
    const code = read(out, rel);
    assert.match(code, /from "\/assets\/pop-window-[0-9a-f]{10}\.js"/);
    assert.ok(!code.includes(": string"), "no type annotations are left");
    const window = result.outputs.find((o) => o.startsWith("assets/pop-window-"))!;
    assert.ok(read(out, "article.html").includes(`rel="modulepreload" href="/${window}"`), "the static import of pop-link is preloaded");
  });

  test("still processes data-image operations and gives sizes", () => {
    const html = read(out, "article.html");
    assert.ok(!html.includes("<picture>"));
    assert.match(html, /<img src="\/assets\/img\/sample-[0-9a-f]{10}\.jpg"[^>]*width="1000" height="1000"/);
    assert.match(html, /<img src="\/photos\/sample\.jpg"[^>]*width="1600" height="1000"/);
  });
});

describe("site components", () => {
  // A component that the test writes to a temporary folder, so the test site
  // shows nothing extra.
  const source = `class TestWidget extends HTMLElement { connectedCallback(): void { this.textContent = "ok"; } }\ncustomElements.define("test-widget", TestWidget);\n`;
  for (const engine of ["esbuild", "builtin"] as const) {
    test(`go in the import map, with ${engine}`, async () => {
      const dir = join(temp, `component-${engine}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "test-widget.ts"), source);
      const out = join(temp, `out-component-${engine}`);
      const result = await build({ ...site, out, images: false, offline: false, js: { engine, components: { "test-widget": join(dir, "test-widget.ts") } } }, { quiet: true });
      assert.deepEqual(result.errors, []);
      const map = JSON.parse(read(out, "index.html").match(/<script type="importmap">(.*?)<\/script>/)![1]) as { imports: Record<string, string>; integrity: Record<string, string> };
      const url = map.imports["ggass/test-widget"];
      assert.ok(url, "the component is in the import map");
      assert.ok(map.integrity[url], "with its integrity value");
      assert.ok(!read(out, url.slice(1)).includes(": void"), "the types are gone");
    });
  }
});

describe("check", () => {
  test("reports a broken link and writes nothing", async () => {
    const out = join(temp, "check");
    const result = await build({ ...site, out, nav: [...(site.nav ?? []), { href: "/missing.html", label: "Missing" }] }, { check: true, quiet: true });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('"/missing.html" has no target')));
    assert.ok(!existsSync(out));
    process.exitCode = 0;
  });
});
