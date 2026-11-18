// Static site generator. Reads site.yaml and content/, checks the links,
// writes dist/. `node site/build.ts --check` checks only and writes nothing.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Page } from "./lib/content.ts";
import { CONTENT, ROOT, load } from "./lib/content.ts";
import { esc, layout, target } from "./lib/html.ts";

const DIST = join(ROOT, "dist");
const CHECK = process.argv.includes("--check");
const { site, pages, files, errors } = load();

// ---------- popup links ----------
// <a href="/x.html" data-pop> (a bare data-pop) opens /x.html in a popup
// window on hover (site/client/pop-link.js). The build wraps the link in
// <pop-link> and points data-pop to /frag/x.html: the page body without the
// layout. Other links stay plain links.
const POP = /<a\b([^>]*)\sdata-pop(?=[\s>])([^>]*)>([\s\S]*?)<\/a>/g;
const withPopups = (page: Page, html: string): string =>
  html.replace(POP, (all, before: string, after: string, label: string) => {
    const href = `${before}${after}`.match(/\shref="([^"]*)"/)?.[1] ?? "";
    const hit = href.startsWith("/") ? pages.get(target(href)) : undefined;
    if (!hit) {
      errors.push(`${page.file}: data-pop on "${href}", which is not a page`);
      return all;
    }
    return `<pop-link><a${before} data-pop="/frag${hit.url}"${after}>${label}</a></pop-link>`;
  });

// ---------- link check ----------
// Each root-relative link must open a page, a generated file, an asset or a
// file from content/.
const GENERATED = new Set(["/search.html", "/search-index.json"]);
const known = (href: string): boolean => {
  const t = target(href);
  return pages.has(t) || GENERATED.has(t) || files.includes(t) || t.startsWith("/assets/");
};
for (const n of site.nav) if (n.href.startsWith("/") && !known(n.href)) errors.push(`site.yaml: nav link "${n.href}" has no target`);
const bodies = new Map<string, string>();
for (const page of pages.values()) {
  const body = withPopups(page, page.body);
  bodies.set(page.url, body);
  for (const [, href] of body.matchAll(/\s(?:href|src|action)="(\/(?!\/)[^"]*)"/g))
    if (!known(href)) errors.push(`${page.file}: link to "${href}" has no target`);
}

if (CHECK) {
  console.log(`ERRORS (${errors.length})`);
  for (const e of errors) console.log("  - " + e);
  process.exit(errors.length ? 1 : 0);
}
if (errors.length) {
  console.error(`Build failed: ${errors.length} error(s):`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

rmSync(DIST, { recursive: true, force: true });

// Font check: the site fonts hold only the characters in
// site/fonts-src/charset.txt. Any other character on a page shows in a
// fallback font, so the build lists it (see the summary at the end).
const fontChars = new Set<number>();
for (const line of readFileSync(join(ROOT, "site", "fonts-src", "charset.txt"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^U\+([0-9A-F]{4,6})(?:-([0-9A-F]{4,6}))?/i);
  if (m) for (let c = parseInt(m[1], 16); c <= parseInt(m[2] ?? m[1], 16); c++) fontChars.add(c);
}
const notInFont = new Map<string, string>(); // character -> first page that uses it
const write = (rel: string, html: string): void => {
  const path = join(DIST, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, html);
  if (!/\.(html|json)$/.test(rel)) return;
  for (const ch of html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]*>/g, " ")) {
    const c = ch.codePointAt(0)!;
    if (c > 0x7e && !fontChars.has(c) && !notInFont.has(ch)) notInFont.set(ch, rel);
  }
};
const copy = (from: string, rel: string): void => {
  mkdirSync(dirname(join(DIST, rel)), { recursive: true });
  copyFileSync(from, join(DIST, rel));
};

// ---------- search ----------
const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>|<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const searchIndex = (): string =>
  JSON.stringify([...pages.values()].map((p) => ({ k: p.kind, t: p.title, x: text(bodies.get(p.url)!), u: p.url })));
const searchPage = `<h1>Search</h1>
<site-search><input type="search" name="q" placeholder="Search this site" aria-label="Search" autofocus><ol class="results"></ol></site-search>
<noscript><p>Search needs JavaScript. Without it, start from the <a href="/">home page</a>.</p></noscript>`;

// ---------- write ----------
for (const page of pages.values()) {
  const body = bodies.get(page.url)!;
  write(page.url.slice(1), layout(site, page.url, page.title, body));
  write(`frag${page.url}`, body);
}
for (const f of files) copy(join(CONTENT, f.slice(1)), f.slice(1));
write("search.html", layout(site, "/search.html", "Search", searchPage));
write("search-index.json", searchIndex());
copy(join(ROOT, "site", "static", "style.css"), "assets/style.css");
// The client is plain JavaScript with JSDoc types, served as written.
for (const f of readdirSync(join(ROOT, "site", "client")).filter((f) => f.endsWith(".js"))) copy(join(ROOT, "site", "client", f), `assets/${f}`);
for (const f of readdirSync(join(ROOT, "site", "static", "fonts"))) copy(join(ROOT, "site", "static", "fonts", f), `assets/fonts/${f}`);
console.log(`Built ${pages.size} pages and ${files.length} other files.`);
if (notInFont.size) {
  const list = [...notInFont].map(([ch, page]) => `${ch} U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")} (${page})`);
  console.warn(`Font: ${notInFont.size} character(s) are not in site/fonts-src/charset.txt and show in a fallback font: ${list.join(", ")}`);
}
