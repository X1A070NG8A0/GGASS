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

import { copyFileSync, mkdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildComponentCss, buildCss } from "./assets/css.ts";
import { buildFonts, type Fonts } from "./assets/fonts.ts";
import { shortHash } from "./assets/hash.ts";
import { pageImages } from "./assets/images.ts";
import { buildJs, buildServiceWorker, type Scripts } from "./assets/js.ts";
import { findComponents } from "./components.ts";
import { resolveConfig, type ResolvedConfig, type SiteConfig } from "./config.ts";
import { target, textOf } from "./html.ts";
import { raw as rawHtml } from "./jsx-runtime.ts";
import { listStatic, loadData, loadPagedefs, type ParseCache } from "./pagedefs.ts";
import { any, isChildren, optional, parseFields, text, type Fields, type Issue } from "./schema.ts";
import { deepFreeze, makeSite } from "./site.ts";
import { formatMs, Timings, type Asset, type BuildContext, type Output, type RenderedPage } from "./steps.ts";
import { loadTemplates, type AnyPage, type LoadedTemplate } from "./templates.ts";
import { customTags, headings, popups, sideNotes } from "./transform.ts";

export type BuildOptions = {
  check?: boolean;
  // Hides the summary and the warnings. Errors still print.
  quiet?: boolean;
};

export type BuildResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  pages: number;
  outputs: string[];
  // The files that this build wrote or deleted in the output folder.
  changed: number;
  timings: [string, number][];
};

const pageText = (page: RenderedPage) =>
  textOf(page.body.replace(/<section class="endnotes"[\s\S]*?<\/section>/, "").replace(/<a class="note-(?:ref|num)"[^>]*>\d+<\/a>/g, ""));

function importMap(js: Scripts, css: Map<string, Asset>): string {
  const map = {
    imports: Object.fromEntries([...[...js.modules].map(([tag, a]) => [`ggass/${tag}`, a.url]), ...[...css].map(([tag, a]) => [`ggass/${tag}.css`, a.url])]),
    integrity: Object.fromEntries([...js.files, ...css.values()].map((f) => [f.url, f.integrity])),
  };
  return `<script type="importmap">${JSON.stringify(map)}</script>`;
}

const firstFrame = (e: unknown): string => {
  if (!(e instanceof Error)) return String(e);
  const at = e.stack?.split("\n").find((l) => l.trim().startsWith("at "));
  return at ? `${e.message} (${at.trim()})` : e.message;
};

const signature = (o: Output): string => {
  if (typeof o === "string" || o instanceof Uint8Array) return shortHash(o);
  const st = statSync(o.file);
  return `${o.file}|${st.mtimeMs}|${st.size}`;
};

// A builder keeps its caches between builds. build() makes a new one each
// time, and run(site) keeps one for the watch builds.
export class Builder {
  readonly config: ResolvedConfig;
  // More HTML for the head of each page, for example the reload script.
  readonly head: string[] = [];
  private readonly parsed: ParseCache = new Map();
  private readonly renders = new Map<string, { key: string; deps: string[]; body: string }>();
  private readonly images = new Map<string, { key: string; body: string; emits: [string, Output][] }>();
  private fonts?: { result: Fonts; emits: [string, Output][] };
  private written?: Map<string, string>;

  constructor(site: SiteConfig) {
    this.config = resolveConfig(site);
  }

  async build(options: BuildOptions = {}): Promise<BuildResult> {
    const started = performance.now();
    const { config } = this;
    const timings = new Timings();
    const log = options.quiet ? () => {} : (s: string) => console.log(s);
    const errors: string[] = [];
    const warnings: string[] = [];
    const outputs = new Map<string, Output>();
    const rendered = new Map<string, RenderedPage>();
    const ctx: BuildContext = {
      config,
      pages: rendered,
      files: [],
      errors,
      warnings,
      outputs,
      head: [...this.head],
      emit: (path, data) => void outputs.set(path.replace(/\\/g, "/").replace(/^\/+/, ""), data),
    };
    let changed = 0;
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
      return { ok, errors, warnings, pages: rendered.size, outputs: [...outputs.keys()].sort(), changed, timings: timings.list };
    };
    if (!config.name) errors.push("configuration: no site name");

    const { templates, data, raw, statics } = await timings.run("load", async () => ({
      templates: await loadTemplates(config, errors),
      data: loadData(config, this.parsed, errors),
      raw: loadPagedefs(config, this.parsed, errors),
      statics: listStatic(config),
    }));
    if (!templates) return finish(false);
    ctx.files = statics.map((f) => f.url);
    if (!raw.has("/search.html"))
      raw.set("/search.html", { url: "/search.html", file: "the GGASS search page", values: { title: "Search", template: "search" }, where: () => "the GGASS search page", version: "search", children: [], generated: true });
    for (const f of statics) {
      if (raw.has(f.url)) errors.push(`static${f.url}: the address is taken already by ${raw.get(f.url)!.file}`);
      if (/^\/(assets|frag)\//.test(f.url)) errors.push(`static${f.url}: GGASS keeps /assets/ and /frag/ for its own files`);
    }

    // Each pagedef against the schema of its template.
    const pages = new Map<string, AnyPage>();
    const templateOf = new Map<string, LoadedTemplate>();
    await timings.run("check", () => {
      for (const r of raw.values()) {
        const parentFields = r.parent ? templateOf.get(r.parent)?.template.fields : undefined;
        const childDefault = isChildren(parentFields?.pages) ? parentFields.pages.template : undefined;
        if (r.values.template !== undefined && typeof r.values.template !== "string") {
          errors.push(`${r.where(["template"])}: template must be the name of a file in template/`);
          continue;
        }
        const name = (r.values.template as string | undefined) ?? childDefault ?? "page";
        const t = name === "frame" ? undefined : templates.pages.get(name);
        if (!t) {
          errors.push(`${r.where(["template"])}: no template "${name}" in template/`);
          continue;
        }
        templateOf.set(r.url, t);
        const fields: Fields = { title: text(), kind: optional(text()), template: optional(text()), pages: optional(any()), ...(r.parent ? { id: text() } : {}), ...t.template.fields };
        const issues: Issue[] = [];
        const values = parseFields(fields, r.values, [], issues, { extra: t.template.extra });
        for (const i of issues) errors.push(`${r.where(i.path)}: ${i.message}`);
        if (!isChildren(t.template.fields.pages)) delete values.pages;
        pages.set(r.url, { ...values, url: r.url, file: r.file, template: name, title: (values.title as string | undefined) ?? r.url, kind: (values.kind as string | undefined) ?? "Page" });
      }
      for (const [url, t] of templateOf)
        if (isChildren(t.template.fields.pages)) (pages.get(url) as Record<string, unknown>).pages = raw.get(url)!.children.map((u) => pages.get(u)).filter(Boolean);
      deepFreeze(data.values);
      for (const p of pages.values()) deepFreeze(p);
    });
    if (errors.length) return finish(false);

    // A page renders again only if its pagedef, its template, or a page or
    // data file that it read changed.
    const pageVersion = (url: string) => (raw.has(url) ? `${raw.get(url)!.version}.${templateOf.get(url)?.version}` : "none");
    const allPages = shortHash([...raw.keys()].map((u) => `${u} ${pageVersion(u)}`).join("\n"));
    const allData = shortHash([...data.versions].map(([k, v]) => `${k} ${v}`).join("\n"));
    const depVersion = (dep: string) => {
      if (dep.startsWith("page:")) return pageVersion(dep.slice(5));
      if (dep === "data:*") return allData;
      if (dep.startsWith("data:")) return data.versions.get(dep.slice(5)) ?? "none";
      return allPages;
    };
    const keyOf = (url: string, deps: string[]) => shortHash(pageVersion(url), ...deps.map((d) => `\n${d} ${depVersion(d)}`));
    await timings.run("render", () => {
      for (const [url, page] of pages) {
        const r = raw.get(url)!;
        const hit = this.renders.get(url);
        let body = hit && hit.key === keyOf(url, hit.deps) ? hit.body : undefined;
        if (body === undefined) {
          const deps = new Set<string>();
          try {
            body = String(templateOf.get(url)!.template.render(page as never, makeSite(config, data.values, pages, raw, (d) => deps.add(d))));
          } catch (e) {
            errors.push(`${r.file}: template "${page.template}": ${firstFrame(e)}`);
            continue;
          }
          const list = [...deps].sort();
          this.renders.set(url, { key: keyOf(url, list), deps: list, body });
        }
        rendered.set(url, { url, title: page.title, kind: page.kind, file: r.file, body, toc: [], page, unlisted: r.generated });
      }
      for (const url of this.renders.keys()) if (!pages.has(url)) this.renders.delete(url);
    });
    if (errors.length) return finish(false);

    const popTargets = new Set<string>();
    await timings.run("pages", () => {
      for (const page of rendered.values()) {
        headings(page);
        popups(page, rendered, errors, popTargets);
        sideNotes(page, errors);
      }
    });

    await timings.run("images", async () => {
      const filesKey = shortHash(statics.map((f) => `${f.url}|${f.mtimeMs}|${f.size}`).join("\n"), JSON.stringify(config.images));
      const todo: RenderedPage[] = [];
      const keys = new Map<string, string>();
      for (const page of rendered.values()) {
        const key = shortHash(page.body, filesKey);
        const hit = this.images.get(page.url);
        if (hit?.key === key) {
          page.body = hit.body;
          for (const [rel, o] of hit.emits) ctx.emit(rel, o);
        } else {
          keys.set(page.url, key);
          todo.push(page);
        }
      }
      const emits = new Map<string, [string, Output][]>();
      const failed = errors.length;
      await pageImages(ctx, todo, (page, rel, o) => emits.set(page.url, [...(emits.get(page.url) ?? []), [rel, o]]));
      if (errors.length === failed)
        for (const page of todo) this.images.set(page.url, { key: keys.get(page.url)!, body: page.body, emits: emits.get(page.url) ?? [] });
      for (const url of this.images.keys()) if (!rendered.has(url)) this.images.delete(url);
    });
    for (const step of config.steps) {
      const hook = step.page;
      if (hook)
        await timings.run(step.name, async () => {
          for (const page of rendered.values()) page.body = await hook(page.body, page, ctx);
        });
    }

    await timings.run("links", () => {
      const generated = new Set(["/search-index.json", ...(config.offline ? ["/sw.js"] : [])]);
      const files = new Set(ctx.files);
      const hasTarget = (href: string) => {
        const t = target(href);
        return rendered.has(t) || generated.has(t) || files.has(t) || outputs.has(t.slice(1)) || t.startsWith("/assets/");
      };
      for (const n of config.nav) if (n.href.startsWith("/") && !hasTarget(n.href)) errors.push(`configuration: nav link "${n.href}" has no target`);
      for (const page of rendered.values())
        for (const [, href] of page.body.matchAll(/\s(?:href|src|action)="(\/(?!\/)[^"]*)"/g))
          if (!hasTarget(href)) errors.push(`${page.file}: link to "${href}" has no target`);
    });
    if (options.check) {
      log(`Checked ${rendered.size} pages: ${errors.length} error(s).`);
      return finish(errors.length === 0);
    }
    if (errors.length) return finish(false);

    const texts = new Map([...rendered.values()].map((p) => [p.url, pageText(p)]));
    const fonts = await timings.run("fonts", async () => {
      // A watch build keeps the fonts of the first build, so typing does
      // not cut the fonts again on each save.
      if (this.fonts && this.written) {
        for (const [rel, o] of this.fonts.emits) ctx.emit(rel, o);
        return this.fonts.result;
      }
      // Only the footer is HTML. The other parts are text already.
      const siteText = [config.name, textOf(config.footer), ...config.nav.map((n) => n.label), ...[...rendered.values()].map((p) => p.title), ...texts.values()].join(" ");
      const before = new Set(outputs.keys());
      const result = await buildFonts(ctx, siteText);
      this.fonts = { result, emits: [...outputs].filter(([rel]) => !before.has(rel)) };
      return result;
    });
    const components = findComponents(config, errors);
    const css = await timings.run("css", async () => {
      const main = await buildCss(ctx, fonts.css);
      const parts = await Promise.all([...components.values()].filter((c) => c.css).map(async (c) => [c.tag, await buildComponentCss(ctx, c.tag, c.css!)] as const));
      return { main, components: new Map(parts.filter((p): p is readonly [string, Asset] => !!p[1])) };
    });
    const js = await timings.run("js", () => buildJs(ctx, components));
    for (const step of config.steps) {
      const hook = step.site;
      if (hook) await timings.run(step.name, () => hook(ctx));
    }
    if (errors.length || !js) return finish(false);

    await timings.run("layout", () => {
      const link = (a: Asset) => `<link rel="stylesheet" href="${a.url}" integrity="${a.integrity}">`;
      const shared = [...fonts.preloads, css.main ? link(css.main) : "", importMap(js, css.components)].filter(Boolean);
      const loader = `<script type="module" src="${js.loader.url}" integrity="${js.loader.integrity}"></script>`;
      const integrityByUrl = new Map(js.files.map((f) => [f.url, f.integrity]));
      const perPage = (html: string) => {
        const seen = new Set<string>();
        const add = (url: string) => {
          if (seen.has(url)) return;
          seen.add(url);
          for (const dep of js.imports.get(url) ?? []) add(dep);
        };
        add(js.loader.url);
        const sheets: string[] = [];
        for (const t of customTags(html)) {
          const m = js.modules.get(t);
          if (m) add(m.url);
          const sheet = css.components.get(t);
          if (sheet) sheets.push(link(sheet));
        }
        seen.delete(js.loader.url);
        return [...sheets, ...[...seen].map((url) => `<link rel="modulepreload" href="${url}" integrity="${integrityByUrl.get(url)}">`)];
      };
      const site = makeSite(config, data.values, pages, raw, () => {});
      for (const page of rendered.values()) {
        const toc = config.toc && page.toc.length >= config.toc.min ? page.toc : [];
        let html: string;
        try {
          html = String(templates.frame.frame.render({ page: page.page, toc, body: rawHtml(page.body), head: rawHtml("<!--head-->") }, site));
        } catch (e) {
          errors.push(`${templates.frame.file}: ${firstFrame(e)}`);
          return;
        }
        const head = [...shared, ...perPage(html), loader, ...ctx.head].join("\n");
        ctx.emit(page.url, html.replace("<!--head-->", head));
        if (popTargets.has(page.url)) ctx.emit(`frag${page.url}`, page.body);
      }
      const listed = [...rendered.values()].filter((p) => !p.unlisted);
      ctx.emit("search-index.json", JSON.stringify(listed.map((p) => ({ k: p.kind, t: p.title, x: texts.get(p.url), u: p.url }))));
    });
    if (errors.length) return finish(false);

    if (config.offline) {
      const assets: Asset[] = [...(css.main ? [css.main] : []), ...css.components.values(), ...js.files];
      const precache = ["/", "/search.html", "/search-index.json", ...assets.map((a) => a.url), ...[...outputs.keys()].filter((k) => k.startsWith("assets/fonts/")).map((k) => `/${k}`)];
      await timings.run("offline", () => buildServiceWorker(ctx, precache));
    }
    for (const f of statics) ctx.emit(f.url, { file: f.path });

    await timings.run("write", () => {
      const write = (rel: string, data: Output) => {
        const path = join(config.out, rel);
        mkdirSync(dirname(path), { recursive: true });
        if (typeof data === "string" || data instanceof Uint8Array) writeFileSync(path, data);
        else copyFileSync(data.file, path);
        changed++;
      };
      const next = new Map<string, string>();
      if (!this.written) rmSync(config.out, { recursive: true, force: true });
      for (const [rel, data] of outputs) {
        const sig = signature(data);
        next.set(rel, sig);
        if (this.written?.get(rel) !== sig) write(rel, data);
      }
      for (const rel of this.written?.keys() ?? []) {
        if (next.has(rel)) continue;
        try {
          unlinkSync(join(config.out, rel));
          changed++;
        } catch {
          // Gone already.
        }
      }
      this.written = next;
    });
    const total = performance.now() - started;
    log(`Built ${rendered.size} pages and ${outputs.size - rendered.size} other files in ${formatMs(total)} (${timings.report()}).`);
    return finish(true);
  }
}

export const build = (site: SiteConfig, options: BuildOptions = {}): Promise<BuildResult> => new Builder(site).build(options);
