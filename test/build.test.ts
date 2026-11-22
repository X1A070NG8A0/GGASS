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

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { after, before, describe, test } from "node:test";
import { build, Builder, integrity, serve, textOf, withBasePath, type BuildResult, type SiteConfig } from "ggass";
import { site } from "./fixture/build.ts";

const temp = mkdtempSync(join(tmpdir(), "ggass-test-"));
after(() => rmSync(temp, { recursive: true, force: true }));

const read = (out: string, rel: string) => readFileSync(join(out, rel), "utf8");

// A small site in a new folder. The keys of `files` are paths in the site.
// Each site has a home page, because the search page links to it.
let sites = 0;
function makeSite(files: Record<string, string>, settings: Partial<SiteConfig> = {}): SiteConfig & { root: string; out: string } {
  const root = join(temp, `site-${++sites}`);
  for (const [path, text] of Object.entries({ "pagedef/index.yaml": "title: Home\nbody: <p>Home</p>\n", ...files })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return { name: "Test", images: false, ...settings, root, out: join(root, "dist") };
}

async function errorsOf(files: Record<string, string>): Promise<string[]> {
  const result = await build(makeSite(files), { check: true, quiet: true });
  process.exitCode = 0;
  return result.errors;
}

const importMap = (html: string) => {
  const json = /<script type="importmap">(.*?)<\/script>/.exec(html)?.[1];
  assert.ok(json, "the page has an import map");
  return JSON.parse(json) as { imports: Record<string, string>; integrity: Record<string, string> };
};

function checkIntegrity(out: string, html: string, basePath = ""): number {
  let n = 0;
  for (const m of html.matchAll(new RegExp(`(?:href|src)="${basePath}(/assets/[^"]+)" integrity="([^"]+)"`, "g"))) {
    assert.equal(integrity(readFileSync(join(out, m[1].slice(1)))), m[2], `integrity of ${m[1]}`);
    n++;
  }
  for (const [url, sum] of Object.entries(importMap(html).integrity)) {
    assert.ok(url.startsWith(`${basePath}/assets/`), `${url} is under ${basePath}/assets/`);
    assert.equal(integrity(readFileSync(join(out, url.slice(basePath.length + 1)))), sum, `import map integrity of ${url}`);
    n++;
  }
  return n;
}

describe("build of the test site", () => {
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
    assert.ok(!text.includes(".popbar"), "the component styles are not in the main stylesheet");
    assert.ok(text.includes(`sourceMappingURL=${css.split("/")[1]}.map`));
    const map = JSON.parse(read(out, `${css}.map`)) as { sources: string[] };
    assert.ok(map.sources.some((s) => s.endsWith("parts/figures.css")));
  });

  test("loads only the modules and stylesheets of the elements on a page", () => {
    const html = read(out, "article.html");
    const preloads = [...html.matchAll(/rel="modulepreload" href="\/assets\/([a-z-]+)-/g)].map((m) => m[1]);
    for (const tag of ["side-note", "page-toc", "pop-link", "photo-zoom"]) assert.ok(preloads.includes(tag), `preload ${tag}`);
    for (const tag of ["check-list", "section-tabs", "site-search"]) assert.ok(!preloads.includes(tag), `no preload for ${tag}`);
    const sheets = [...html.matchAll(/rel="stylesheet" href="\/assets\/([a-z-]+)-[0-9a-f]{10}\.css"/g)].map((m) => m[1]);
    assert.deepEqual(sheets.sort(), ["key-shortcuts", "photo-zoom", "pop-link", "share-button", "side-note", "style"]);
    const map = importMap(html);
    assert.match(map.imports["ggass/check-list.css"], /^\/assets\/check-list-[0-9a-f]{10}\.css$/, "a popup can load the stylesheet of another element");
  });

  test("turns side notes into references, margin notes and print notes", () => {
    const html = read(out, "article.html");
    assert.equal([...html.matchAll(/<a class="note-ref" id="note-ref-(\d)"/g)].length, 5);
    assert.ok(html.includes('<side-note id="note-1" role="note"'));
    assert.match(html, /see both\.<a class="note-ref"[^>]*>1<\/a><side-note id="note-1"[\s\S]*?<\/side-note><\/p>/);
    assert.match(html, /<section class="endnotes"[\s\S]*<li>A side note\./);
  });

  test("writes a table of contents from the headings", () => {
    const html = read(out, "article.html");
    assert.ok(html.includes('<nav class="toc" id="toc" aria-labelledby="toc-title" popover>'));
    assert.ok(html.includes('<a href="#the-wide-presentation">The wide presentation</a><ol><li><a href="#keyboard-shortcuts">'));
    assert.ok(!html.includes('href="#endnotes-title"'), "the print notes heading is not in the contents");
    assert.ok(html.includes('<button type="button" popovertarget="toc">Contents</button>'));
    assert.ok(!read(out, "index.html").includes('id="toc"'), "a page with no headings has no contents");
    assert.ok(!read(out, "elements/tab-two.html").includes('id="toc"'), "a page with fewer than toc.min headings has no contents");
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
    assert.ok(existsSync(join(out, "photos", "sample.jpg")), "static/ is copied");
  });

  test("renders the pagedefs with their templates", () => {
    const home = read(out, "index.html");
    assert.ok(home.includes('<h1 class="brandmark">Example site</h1>'), "the site template home.tsx");
    assert.equal([...home.matchAll(/<li><a href="[^"]+">[^<]+<\/a><span>/g)].length, 3, "one card for each entry of data/cards.yaml");
    const tab = read(out, "elements/tab-two.html");
    assert.ok(tab.includes('<p class="crumb"><a href="/elements/">Elements</a></p><h1>Second tab</h1>'), "a child page with the template that its parent names");
    const index = JSON.parse(read(out, "search-index.json")) as { k: string; t: string; u: string }[];
    assert.deepEqual(index.map((e) => [e.u, e.k]), [
      ["/article.html", "Essay"],
      ["/elements/index.html", "Reference"],
      ["/elements/tab-two.html", "Reference"],
      ["/index.html", "Page"],
    ], "the kind from _defaults.yaml, and no entry for the search page");
    assert.ok(read(out, "search.html").includes('<site-search><label class="field" for="search-q">'));
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

describe("build without responsive images", () => {
  const out = join(temp, "plain-images");
  let result: BuildResult;
  before(async () => {
    result = await build({ ...site, out, images: { responsive: false } }, { quiet: true });
  });

  test("succeeds", () => {
    assert.deepEqual(result.errors, []);
  });

  test("still processes data-image operations and gives sizes", () => {
    const html = read(out, "article.html");
    assert.ok(!html.includes("<picture>"));
    assert.match(html, /<img src="\/assets\/img\/sample-[0-9a-f]{10}\.jpg"[^>]*width="1000" height="1000"/);
    assert.match(html, /<img src="\/photos\/sample\.jpg"[^>]*width="1600" height="1000"/);
  });
});

describe("base path", () => {
  const out = join(temp, "base-path");
  const basePath = "/my-site";
  const PAGES = ["index.html", "article.html", "elements/index.html", "search.html"];
  let result: BuildResult;
  before(async () => {
    result = await build({ ...site, out, basePath: "my-site/" }, { quiet: true });
  });

  test("succeeds, and writes the files at the same places", () => {
    assert.deepEqual(result.errors, []);
    for (const rel of [...PAGES, "frag/article.html", "search-index.json", "sw.js"]) assert.ok(result.outputs.includes(rel), rel);
  });

  test("puts the base path in front of each root address in the HTML", () => {
    for (const page of [...PAGES, "frag/article.html"]) {
      const html = read(out, page);
      for (const [, url] of html.matchAll(/\s(?:href|src|action|data-pop|data-sw)="(\/[^"]*)"/g)) assert.ok(url.startsWith(`${basePath}/`), `${page}: ${url}`);
      for (const [, list] of html.matchAll(/\ssrcset="([^"]*)"/g))
        for (const c of list.split(", ")) assert.ok(c.startsWith(`${basePath}/`), `${page}: srcset ${c}`);
    }
    const html = read(out, "article.html");
    assert.ok(html.includes(`<a class="brand" href="${basePath}/">`));
    assert.ok(html.includes(`href="${basePath}/elements/"`), "a nav link");
    assert.ok(html.includes(`data-sw="${basePath}/sw.js"`));
    assert.match(html, /data-pop="\/my-site\/frag\/[^"]+"/);
    assert.match(html, /srcset="\/my-site\/assets\/img\//);
  });

  test("every integrity value matches its file", () => {
    for (const page of PAGES) assert.ok(checkIntegrity(out, read(out, page), basePath) > 5);
  });

  test("puts the base path in the search index and the service worker", () => {
    const index = JSON.parse(read(out, "search-index.json")) as { u: string }[];
    assert.ok(index.length > 0 && index.every((e) => e.u.startsWith(`${basePath}/`)));
    const sw = read(out, "sw.js");
    const precache = JSON.parse(/^const PRECACHE = (.*);$/m.exec(sw)?.[1] ?? "[]") as string[];
    assert.ok(precache.includes(`${basePath}/`) && precache.every((u) => u.startsWith(`${basePath}/`)));
    assert.ok(sw.includes(`const BASE_PATH = "${basePath}";`));
  });

  test("puts the base path in front of root addresses in the CSS", async () => {
    const config = makeSite(
      { "style.css": "body { background: url(/bg.png); }\n.cdn { background: url(//cdn.example.com/a.png); }\n", "static/bg.png": "png" },
      { basePath, css: { entry: "style.css" } },
    );
    const built = await build(config, { quiet: true });
    assert.deepEqual(built.errors, []);
    const css = read(config.out, built.outputs.find((o) => /^assets\/style-[0-9a-f]{10}\.css$/.test(o))!);
    assert.match(css, /url\("?\/my-site\/bg\.png"?\)/);
    assert.match(css, /url\("?\/\/cdn\.example\.com\/a\.png"?\)/);
  });

  test("leaves other addresses as they are", () => {
    const html = `<a href="/a.html">a</a> <a href='/b.html'>b</a> <a href="//cdn.example.com/c">c</a> <a href="#d">d</a> <a href="mailto:e@example.com">e</a> <img srcset="/f-400.jpg 400w, https://example.com/g.jpg 800w">`;
    assert.equal(
      withBasePath(html, basePath),
      `<a href="/my-site/a.html">a</a> <a href='/my-site/b.html'>b</a> <a href="//cdn.example.com/c">c</a> <a href="#d">d</a> <a href="mailto:e@example.com">e</a> <img srcset="/my-site/f-400.jpg 400w, https://example.com/g.jpg 800w">`,
    );
    assert.equal(withBasePath(html, ""), html);
  });

  test("a base path that is not a path is an error", async () => {
    const result = await build(makeSite({}, { basePath: "https://example.com/my-site" }), { check: true, quiet: true });
    process.exitCode = 0;
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /^configuration: basePath ".*" must be a path/);
  });

  test("the local server serves the site under the base path", async () => {
    const server = serve({ ...site, out, basePath }, { port: 0, quiet: true });
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    try {
      const at = (path: string) => fetch(`http://127.0.0.1:${port}${path}`, { redirect: "manual" });
      const root = await at("/");
      assert.equal(root.status, 302);
      assert.equal(root.headers.get("location"), `${basePath}/`);
      const home = await at(`${basePath}/`);
      assert.equal(home.status, 200);
      assert.ok((await home.text()).includes(`href="${basePath}/article.html"`));
      assert.equal((await at(`${basePath}/article.html?x=1`)).status, 200);
      assert.equal((await at("/article.html")).status, 404);
    } finally {
      server.close();
    }
  });
});

describe("pagedefs", () => {
  test("a number in the YAML is text, and a map is an error that names its line", async () => {
    const errors = await errorsOf({ "pagedef/year.yaml": "title: 2026\nkind: 7\nbody: <p>2026</p>\n", "pagedef/map.yaml": "body: <p>Map</p>\ntitle: { a: 1 }\n" });
    assert.deepEqual(errors, ["pagedef/map.yaml:2: title: must be text"]);
  });

  test("a key that the template does not list is an error", async () => {
    const errors = await errorsOf({ "pagedef/a.yaml": "title: A\ntilte: B\nbody: <p>A</p>\n" });
    assert.deepEqual(errors, ["pagedef/a.yaml:2: tilte: unknown key. The keys here are: title, kind, template, pages, body."]);
  });

  test("HTML that does not close is an error", async () => {
    const errors = await errorsOf({ "pagedef/a.yaml": "title: A\nbody: |\n  <p>One <b>two</p>\n" });
    assert.deepEqual(errors, ["pagedef/a.yaml:2: body: <b> is not closed before </p>"]);
  });

  test("a .yml file and a missing template are errors", async () => {
    const errors = await errorsOf({ "pagedef/a.yml": "title: A\n", "pagedef/b.yaml": "title: B\ntemplate: nothing\n" });
    assert.deepEqual(errors, ["pagedef/a.yml: GGASS reads .yaml files only. Rename it to .yaml.", 'pagedef/b.yaml:2: no template "nothing" in template/']);
  });

  test("_defaults.yaml applies in its folder and below, and the nearest one wins", async () => {
    const s = makeSite({
      "pagedef/_defaults.yaml": "kind: Outer\n",
      "pagedef/sub/_defaults.yaml": "kind: Inner\n",
      "pagedef/top.yaml": "title: Top\nbody: <p>Top</p>\n",
      "pagedef/sub/deep/page.yaml": "title: Deep\nbody: <p>Deep</p>\n",
      "pagedef/sub/own.yaml": "title: Own\nkind: Mine\nbody: <p>Own</p>\n",
    });
    assert.deepEqual((await build(s, { quiet: true })).errors, []);
    const index = JSON.parse(read(s.out, "search-index.json")) as { k: string; u: string }[];
    assert.deepEqual(Object.fromEntries(index.map((e) => [e.u, e.k])), { "/index.html": "Outer", "/sub/deep/page.html": "Inner", "/sub/own.html": "Mine", "/top.html": "Outer" });
  });

  test("child pages get addresses under their parent and templates from its schema", async () => {
    const s = makeSite({
      "template/book.tsx": `import { children, template } from "ggass";\nexport default template({ fields: { pages: children("chapter") }, render: (p) => <h1>{p.title}</h1> });\n`,
      "template/chapter.tsx": `import { template } from "ggass";\nexport default template({ fields: {}, render: (p, site) => <h1>{p.title} in {site.parent(p)?.title}</h1> });\n`,
      "pagedef/book/index.yaml": "title: Book\ntemplate: book\npages:\n  - id: one\n    title: One\n  - id: 2\n    title: Two\n    template: page\n    body: <p>Two</p>\n",
      "pagedef/guide.yaml": "title: Guide\ntemplate: book\npages:\n  - id: start\n    title: Start\n",
    });
    assert.deepEqual((await build(s, { quiet: true })).errors, []);
    assert.ok(read(s.out, "book/one.html").includes("<h1>One in Book</h1>"));
    assert.ok(read(s.out, "book/2.html").includes("<h1>Two</h1>"), "a child can name its own template");
    assert.ok(read(s.out, "guide/start.html").includes("<h1>Start in Guide</h1>"));
  });

  test("two pagedefs with one address are an error", async () => {
    const errors = await errorsOf({ "pagedef/a.yaml": "title: A\nbody: <p>A</p>\npages:\n  - id: b\n    title: B\n    body: <p>B</p>\n", "pagedef/a/b.yaml": "title: B\nbody: <p>B</p>\n" });
    assert.deepEqual(errors, ["pagedef/a/b.yaml: the address /a/b.html is taken already by pagedef/a.yaml:4"]);
  });

  test("a site template replaces the GGASS template of the same name", async () => {
    const s = makeSite({
      "template/page.tsx": `import { html, template } from "ggass";\nexport default template({ fields: { body: html() }, render: (p) => <article>{p.body}</article> });\n`,
      "pagedef/index.yaml": "title: Home\nbody: <p>Hello & welcome</p>\n",
    });
    assert.deepEqual((await build(s, { quiet: true })).errors, []);
    assert.ok(read(s.out, "index.html").includes("<article><p>Hello & welcome</p></article>"), "an html() value goes in as it is");
  });

  test("text is escaped, and an error in a template names the page", async () => {
    const s = makeSite({
      "template/note.tsx": `import { template, text } from "ggass";\nexport default template({ fields: { note: text() }, render: (p) => { if (p.note === "fail") throw new Error("no"); return <p>{p.note}</p>; } });\n`,
      "pagedef/a.yaml": "title: A\ntemplate: note\nnote: <b>bold</b> & more\n",
    });
    assert.deepEqual((await build(s, { quiet: true })).errors, []);
    assert.ok(read(s.out, "a.html").includes("<p>&lt;b&gt;bold&lt;/b&gt; &amp; more</p>"));
    const errors = await errorsOf({ ...Object.fromEntries([["template/note.tsx", readFileSync(join(s.root, "template", "note.tsx"), "utf8")]]), "pagedef/b.yaml": "title: B\ntemplate: note\nnote: fail\n" });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^pagedef\/b\.yaml: template "note": no \(at .*note\.tsx:\d+:\d+/);
  });
});

describe("components", () => {
  test("a site component gets its module and stylesheet only on the pages that use it", async () => {
    const s = makeSite({
      "component/test-widget.client.ts": `class TestWidget extends HTMLElement { connectedCallback(): void { this.textContent = "ok"; } }\ncustomElements.define("test-widget", TestWidget);\n`,
      "component/test-widget.css": "test-widget { color: red; }\n",
      "pagedef/with.yaml": "title: With\nbody: <test-widget></test-widget>\n",
      "pagedef/without.yaml": "title: Without\nbody: <p>None</p>\n",
    });
    const result = await build(s, { quiet: true });
    assert.deepEqual(result.errors, []);
    const map = importMap(read(s.out, "with.html"));
    const url = map.imports["ggass/test-widget"];
    assert.ok(url && map.integrity[url], "the component is in the import map, with its integrity value");
    assert.ok(!read(s.out, url.slice(1)).includes(": void"), "the types are gone");
    const css = map.imports["ggass/test-widget.css"];
    assert.ok(read(s.out, "with.html").includes(`<link rel="stylesheet" href="${css}"`));
    assert.ok(!read(s.out, "without.html").includes(`href="${css}"`));
    assert.ok(read(s.out, "without.html").includes('"ggass/test-widget.css"'), "the import map still names it for popups");
  });

  test("a bad component file name is an error", async () => {
    const result = await build(makeSite({ "component/widget.client.ts": "", "pagedef/a.yaml": "title: A\nbody: <p>A</p>\n" }), { quiet: true });
    process.exitCode = 0;
    assert.deepEqual(result.errors, ['component/widget.client.ts: "widget" is not a custom element name (lower case, with a hyphen)']);
  });
});

describe("templates", () => {
  test("a value in a script cannot end the script", async () => {
    const s = makeSite({
      "template/data.tsx": `import { template, text } from "ggass";\nexport default template({ fields: { note: text() }, render: (p) => <script type="application/json">{JSON.stringify({ note: p.note })}</script> });\n`,
      "pagedef/a.yaml": 'title: A\ntemplate: data\nnote: "</script><b>x"\n',
    });
    assert.deepEqual((await build(s, { quiet: true })).errors, []);
    const json = /<script type="application\/json">(.*?)<\/script>/.exec(read(s.out, "a.html"))?.[1];
    assert.deepEqual(JSON.parse(json!), { note: "</script><b>x" });
  });

  test("a heading entity shows once decoded in the contents", async () => {
    const s = makeSite({ "pagedef/a.yaml": "title: A\nbody: <h2>One &mdash; two</h2><h2>B</h2><h2>C</h2>\n" });
    assert.deepEqual((await build(s, { quiet: true })).errors, []);
    assert.ok(read(s.out, "a.html").includes(">One — two</a>"));
  });
});

describe("watch builds", () => {
  test("render again only the pages whose inputs changed, and write only changed files", async () => {
    const s = makeSite({
      "template/counted.tsx": `import { template } from "ggass";\nconst g = globalThis as { renders?: string[] };\nexport default template({ fields: {}, render: (p, site) => { (g.renders ??= []).push(p.url); return <p>{p.url === "/a.html" ? (site.data.words as string[]).join(" ") : "fixed"}</p>; } });\n`,
      "data/words.yaml": "- one\n- two\n",
      "pagedef/a.yaml": "title: A\ntemplate: counted\n",
      "pagedef/b.yaml": "title: B\ntemplate: counted\n",
    });
    const g = globalThis as { renders?: string[] };
    g.renders = [];
    const builder = new Builder(s);
    assert.deepEqual((await builder.build({ quiet: true })).errors, []);
    assert.deepEqual(g.renders.sort(), ["/a.html", "/b.html"]);
    const before = statSync(join(s.out, "b.html")).mtimeMs;

    g.renders = [];
    const same = await builder.build({ quiet: true });
    assert.deepEqual(g.renders, [], "nothing renders again");
    assert.equal(same.changed, 0, "nothing is written again");

    writeFileSync(join(s.root, "data", "words.yaml"), "- three\n");
    g.renders = [];
    const next = await builder.build({ quiet: true });
    assert.deepEqual(g.renders, ["/a.html"], "only the page that read data/words.yaml renders again");
    assert.equal(next.changed, 2, "a.html and the search index");
    assert.ok(read(s.out, "a.html").includes("<p>three</p>"));
    assert.equal(statSync(join(s.out, "b.html")).mtimeMs, before);

    rmSync(join(s.root, "pagedef", "b.yaml"));
    const removed = await builder.build({ quiet: true });
    assert.ok(!existsSync(join(s.out, "b.html")), "the output of a deleted page goes");
    assert.equal(removed.changed, 2, "b.html goes, and the search index changes");
  });
});

describe("check", () => {
  test("text keeps an escaped entity escaped", () => {
    assert.equal(textOf("a &amp;lt;b&amp;gt; &lt;c&gt; &amp;amp;"), "a &lt;b&gt; <c> &amp;");
  });

  test("text decodes named and numeric entities, and keeps unknown ones", () => {
    assert.equal(textOf("A&mdash;B &#8217; &#x2192; &nosuch; &#0;"), "A—B ’ → &nosuch; &#0;");
  });

  test("an output folder that holds the site is an error, and nothing is deleted", async () => {
    const s = makeSite({});
    const result = await build({ ...s, out: "." }, { quiet: true });
    process.exitCode = 0;
    assert.equal(result.ok, false);
    assert.match(result.errors[0], /holds the site/);
    assert.ok(existsSync(join(s.root, "pagedef", "index.yaml")));
  });

  test("reports a broken link and writes nothing", async () => {
    const out = join(temp, "check");
    const result = await build({ ...site, out, nav: [...(site.nav ?? []), { href: "/missing.html", label: "Missing" }] }, { check: true, quiet: true });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('"/missing.html" has no target')));
    assert.ok(!existsSync(out));
    process.exitCode = 0;
  });
});
