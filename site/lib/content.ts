// Loads site.yaml and the pages in content/.
//
// A page is an HTML file that starts with a YAML header between two "---"
// lines. The body is plain HTML and holds its own <h1>:
//
//   ---
//   title: Getting started   # required: the <title> and the search result
//   kind: Guide              # optional: the label in search results (default "Page")
//   ---
//   <h1>Getting started</h1>
//   <p>Body HTML.</p>
//
// content/index.html becomes /index.html, content/guide/start.html becomes
// /guide/start.html. Other files in content/ (images, for example) are copied
// to the same path.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import YAML from "yaml";

export const ROOT = join(import.meta.dirname, "..", "..");
export const CONTENT = join(ROOT, "content");

export type NavItem = { href: string; label: string };
export type Site = { name: string; lang?: string; footer?: string; nav: NavItem[] };
export type Page = { url: string; title: string; kind: string; body: string; file: string };
export type Content = { site: Site; pages: Map<string, Page>; files: string[]; errors: string[] };

export function load(): Content {
  const errors: string[] = [];
  const site = YAML.parse(readFileSync(join(ROOT, "site.yaml"), "utf8")) as Site;
  if (!site?.name) errors.push("site.yaml: no name");
  site.nav ??= [];

  const pages = new Map<string, Page>();
  const files: string[] = [];
  const rels = readdirSync(CONTENT, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => relative(CONTENT, join(d.parentPath, d.name)))
    .sort();
  for (const rel of rels) {
    const url = "/" + rel.split(sep).join("/");
    if (!rel.endsWith(".html")) {
      files.push(url);
      continue;
    }
    const file = `content${url}`;
    const m = readFileSync(join(CONTENT, rel), "utf8").replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!m) {
      errors.push(`${file}: no YAML header (two "---" lines at the start)`);
      continue;
    }
    let head: { title?: string; kind?: string };
    try {
      head = YAML.parse(m[1]) ?? {};
    } catch (e) {
      errors.push(`${file}: YAML header: ${(e as Error).message.split("\n")[0]}`);
      continue;
    }
    if (!head.title) errors.push(`${file}: no title`);
    pages.set(url, { url, title: head.title ?? url, kind: head.kind ?? "Page", body: m[2].trim(), file });
  }
  return { site, pages, files, errors };
}
