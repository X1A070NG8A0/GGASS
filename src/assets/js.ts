// js.ts - JavaScript processing
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

// JavaScript processing: turn TypeScript and JSX into JavaScript, bundle,
// remove unused code (tree shaking), minify, write source maps, put content
// hashes in the names, and give the Subresource Integrity values.
//
// Each custom element is its own entry. A small loader module looks for
// elements that are not defined yet and loads their modules, so a page
// loads only the code for the elements that it holds. An import map names
// each module and carries its integrity value.
//
// With esbuild, all of the steps above. Without it, the built-in code strips
// the TypeScript types with Node, rewrites the imports to the hashed names
// and gives the integrity values. It does not bundle, minify or read JSX.
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import type * as Esbuild from "esbuild";
import type { Asset, BuildContext } from "../steps.ts";
import { fingerprinted, integrity, shortHash } from "./hash.ts";
import { engine } from "./optional.ts";

export const CLIENT = join(import.meta.dirname, "..", "client");
const LOADER = join(CLIENT, "loader.ts");
const WORKER = join(CLIENT, "worker", "sw.ts");

// The elements of GGASS, each with the module in src/client/ of the same name.
export const BUILTIN_COMPONENTS = [
  "check-list", "list-filter", "site-search", "pop-link", "section-tabs", "step-sequence",
  "photo-zoom", "side-note", "page-toc", "key-shortcuts", "share-button",
];

const BANNER = "/*! GGASS components | Apache-2.0 OR LGPL-2.1-or-later */";

export type Scripts = {
  loader: Asset;
  // The module for each element, by tag name.
  modules: Map<string, Asset>;
  // Each JavaScript file, for the integrity values in the import map.
  files: Asset[];
  // The static imports of each file, by URL, for modulepreload links.
  imports: Map<string, string[]>;
};

// Node's type stripping prints an experimental warning. The build uses it on
// purpose, so this hides that one warning.
function strip(source: string): string {
  const emit = process.emitWarning;
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    if (String(typeof warning === "string" ? warning : warning.message).includes("stripTypeScriptTypes")) return;
    return (emit as (...args: unknown[]) => void).call(process, warning, ...rest);
  }) as typeof process.emitWarning;
  try {
    return stripTypeScriptTypes(source, { mode: "strip" });
  } finally {
    process.emitWarning = emit;
  }
}

const esbuildMessage = (e: Esbuild.Message, root: string) =>
  e.location ? `${relative(root, e.location.file).split(sep).join("/")}:${e.location.line}:${e.location.column + 1}: ${e.text}` : e.text;

export async function buildJs(ctx: BuildContext): Promise<Scripts | undefined> {
  const { config, errors } = ctx;
  const components: Record<string, string> = Object.fromEntries(BUILTIN_COMPONENTS.map((tag) => [tag, join(CLIENT, `${tag}.ts`)]));
  for (const [tag, file] of Object.entries(config.js.components)) {
    if (!/^[a-z][a-z0-9]*-[a-z0-9-]*$/.test(tag)) errors.push(`js.components: "${tag}" is not a custom element name (lower case, with a hyphen)`);
    components[tag] = file;
  }
  const esbuild = await engine<typeof Esbuild>("esbuild", config.js.engine, config.root, "js.engine \"esbuild\"", errors);
  const result: Scripts = { loader: { url: "", integrity: "" }, modules: new Map(), files: [], imports: new Map() };

  if (esbuild) {
    const entries = [{ in: LOADER, out: "loader" }, ...Object.entries(components).map(([tag, file]) => ({ in: file, out: tag }))];
    let built: Esbuild.BuildResult<{ write: false; metafile: true }>;
    try {
      built = await esbuild.build({
        entryPoints: entries,
        bundle: true,
        splitting: true,
        format: "esm",
        platform: "browser",
        target: config.js.target,
        minify: config.js.minify,
        treeShaking: true,
        sourcemap: config.js.sourcemap ? "linked" : false,
        write: false,
        metafile: true,
        outdir: join(config.out, "assets"),
        entryNames: config.fingerprint ? "[name]-[hash]" : "[name]",
        chunkNames: "chunk-[hash]",
        banner: { js: BANNER },
        legalComments: "none",
        jsx: config.js.jsx,
        jsxImportSource: config.js.jsxImportSource,
        jsxFactory: config.js.jsxFactory,
        jsxFragment: config.js.jsxFragment,
        absWorkingDir: config.root,
        logLevel: "silent",
      });
    } catch (e) {
      for (const m of (e as Esbuild.BuildFailure).errors ?? [{ text: String(e) } as Esbuild.Message]) errors.push(`JavaScript: ${esbuildMessage(m, config.root)}`);
      return undefined;
    }
    const byEntry = new Map(entries.map((e) => [resolve(e.in), e.out]));
    const urlOf = (metaPath: string) => "/" + relative(config.out, resolve(config.root, metaPath)).split(sep).join("/");
    const sums = new Map<string, string>();
    for (const f of built.outputFiles) {
      const rel = relative(config.out, f.path).split(sep).join("/");
      ctx.emit(rel, f.contents);
      if (rel.endsWith(".js")) sums.set(`/${rel}`, integrity(f.contents));
    }
    for (const [path, out] of Object.entries(built.metafile.outputs)) {
      if (!path.endsWith(".js")) continue;
      const url = urlOf(path);
      const asset = { url, integrity: sums.get(url)! };
      result.files.push(asset);
      result.imports.set(url, out.imports.filter((i) => i.kind === "import-statement" && !i.external).map((i) => urlOf(i.path)));
      const name = out.entryPoint ? byEntry.get(resolve(config.root, out.entryPoint)) : undefined;
      if (name === "loader") result.loader = asset;
      else if (name) result.modules.set(name, asset);
    }
    return result;
  }

  // The built-in route: one output file for each source file.
  const done = new Map<string, Asset>();
  const visiting = new Set<string>();
  const emitModule = (file: string, name: string): Asset | undefined => {
    const known = done.get(file);
    if (known) return known;
    if (visiting.has(file)) {
      errors.push(`${relative(config.root, file)}: import cycle. The built-in JavaScript route needs modules without cycles, or esbuild.`);
      return undefined;
    }
    if (/\.[jt]sx$/.test(file)) {
      errors.push(`${relative(config.root, file)}: JSX needs esbuild. Install it in the site: npm install --save-dev esbuild`);
      return undefined;
    }
    visiting.add(file);
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      errors.push(`${relative(config.root, file)}: module not found`);
      return undefined;
    }
    if (/\.[mc]?ts$/.test(file)) source = strip(source);
    const deps: string[] = [];
    source = source.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(["'])(\.{1,2}\/[^"'\n]+)\2/g, (all, before: string, q: string, spec: string) => {
      const dep = emitModule(resolve(dirname(file), spec), basename(spec).replace(/\.[mc]?[jt]sx?$/, ""));
      if (!dep) return all;
      if (!before.includes("(")) deps.push(dep.url);
      return `${before}${q}${dep.url}${q}`;
    });
    visiting.delete(file);
    const rel = fingerprinted(`assets/${name}.js`, source, config.fingerprint);
    ctx.emit(rel, source);
    const asset = { url: `/${rel}`, integrity: integrity(source) };
    done.set(file, asset);
    result.files.push(asset);
    result.imports.set(asset.url, deps);
    return asset;
  };
  result.loader = emitModule(LOADER, "loader") ?? result.loader;
  for (const [tag, file] of Object.entries(components)) {
    const asset = emitModule(resolve(file), tag);
    if (asset) result.modules.set(tag, asset);
  }
  return result;
}

// The service worker, at /sw.js so that it serves the whole site. It keeps
// the files in `precache` at install, and each page that the reader opens.
export async function buildServiceWorker(ctx: BuildContext, precache: string[]): Promise<void> {
  const { config, errors } = ctx;
  const source = readFileSync(WORKER, "utf8");
  const esbuild = await engine<typeof Esbuild>("esbuild", config.js.engine, config.root, "js.engine \"esbuild\"", errors);
  const code = esbuild ? (await esbuild.transform(source, { loader: "ts", minify: config.js.minify, target: config.js.target })).code : strip(source);
  const version = `ggass-${shortHash(precache.join("\n"))}`;
  ctx.emit("sw.js", `const PRECACHE = ${JSON.stringify(precache)};\nconst VERSION = ${JSON.stringify(version)};\n${code}`);
}
