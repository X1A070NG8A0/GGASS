// css.ts - CSS processing
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

import { readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import type * as Esbuild from "esbuild";
import { slashes, type Asset, type BuildContext } from "../steps.ts";
import { fingerprinted, integrity } from "./hash.ts";
import { engine, esbuildErrors } from "./optional.ts";

const BASE_CSS = join(import.meta.dirname, "..", "style", "ggass.css");

// Removes comments except /*! ones, and only the white space that never has
// meaning. Strings and calc() stay as written.
export function minifyCss(css: string): string {
  let out = "";
  let code = "";
  const flush = () => {
    let done = code
      .replace(/\s+/g, " ")
      .replace(/\s*([{};,>])\s*/g, "$1")
      .replace(/:\s+/g, ":");
    if (out.endsWith("*/")) done = done.replace(/^ /, "");
    out += done;
    code = "";
  };
  for (let i = 0; i < css.length; ) {
    const c = css[i];
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      const stop = end < 0 ? css.length : end + 2;
      if (css[i + 2] === "!") {
        flush();
        out += css.slice(i, stop);
      } else code += " ";
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== c && css[j] !== "\n") j += css[j] === "\\" ? 2 : 1;
      flush();
      out += css.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    code += c;
    i++;
  }
  flush();
  return out.replace(/;}/g, "}").trim();
}

const FILE_TYPES = /\.(woff2?|ttf|otf|png|jpe?g|gif|svg|webp|avif)$/i;

// Also copies each file that a relative url() names into the assets folder.
function bundle(file: string, ctx: BuildContext, seen: Set<string>): string {
  let css: string;
  try {
    css = readFileSync(file, "utf8");
  } catch {
    ctx.errors.push(`${file}: stylesheet not found`);
    return "";
  }
  css = css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (all, q: string, url: string) => {
    if (/^(data:|[a-z]+:|\/|#)/i.test(url) || !FILE_TYPES.test(url.split(/[?#]/)[0])) return all;
    const path = resolve(dirname(file), url.split(/[?#]/)[0]);
    let data: Buffer;
    try {
      data = readFileSync(path);
    } catch {
      ctx.errors.push(`${file}: url(${url}): file not found`);
      return all;
    }
    const rel = fingerprinted(`assets/${basename(path)}`, data, ctx.config.fingerprint);
    ctx.emit(rel, data);
    return `url(${q}/${rel}${q})`;
  });
  return css.replace(/@import\s+(?:url\(\s*)?(["'])([^"']+)\1\s*\)?\s*([^;]*);/g, (all, _q: string, spec: string, condition: string) => {
    if (/^([a-z]+:|\/)/i.test(spec)) return all;
    const path = resolve(dirname(file), spec);
    if (seen.has(path)) return "";
    seen.add(path);
    const inner = bundle(path, ctx, seen);
    const layer = condition.match(/^layer\(([^)]*)\)\s*(.*)$/);
    const media = (layer ? layer[2] : condition).trim();
    let wrapped = layer ? `@layer ${layer[1]} {\n${inner}\n}` : condition.trim() === "layer" ? `@layer {\n${inner}\n}` : inner;
    if (media) wrapped = `@media ${media} {\n${wrapped}\n}`;
    return wrapped;
  });
}

export async function buildCss(ctx: BuildContext, extra: string): Promise<Asset | undefined> {
  const { config, errors } = ctx;
  const files = [...(config.css.base ? [BASE_CSS] : []), ...(config.css.entry ? [config.css.entry] : [])];
  if (!files.length && !extra) return undefined;
  const esbuild = await engine<typeof Esbuild>("esbuild", config.css.engine, config.root, "css.engine \"esbuild\"", errors);
  let css: string;
  let map: string | undefined;
  if (esbuild) {
    // Relative paths, so that the plugin below never sees an absolute path
    // that starts with "/" (on Linux and macOS).
    const relPath = (f: string) => {
      const r = slashes(relative(config.root, f));
      return /^[a-z]:/i.test(r) || r.startsWith("../") ? r : `./${r}`;
    };
    const entry = files.map((f) => `@import ${JSON.stringify(relPath(f))};`).join("\n") + "\n" + extra;
    try {
      const result = await esbuild.build({
        // The entry has no file. Its name must not match a real file, or an
        // @import of that file looks like a cycle.
        stdin: { contents: entry, resolveDir: config.root, sourcefile: "<ggass entry>.css", loader: "css" },
        bundle: true,
        write: false,
        minify: config.css.minify,
        sourcemap: config.css.sourcemap ? "external" : false,
        outfile: join(config.out, "assets", "style.css"),
        // esbuild's `external: ["/*"]` also matches resolved file paths, so a
        // plugin keeps root-relative URLs as written.
        plugins: [{ name: "root-relative", setup: (b) => void b.onResolve({ filter: /^\// }, (args) => (args.kind === "entry-point" ? undefined : { path: args.path, external: true })) }],
        loader: { ".woff2": "file", ".woff": "file", ".ttf": "file", ".otf": "file", ".png": "file", ".jpg": "file", ".jpeg": "file", ".gif": "file", ".svg": "file", ".webp": "file", ".avif": "file" },
        assetNames: config.fingerprint ? "[name]-[hash]" : "[name]",
        target: config.css.targets,
        logLevel: "silent",
      });
      css = "";
      for (const f of result.outputFiles) {
        const rel = slashes(relative(config.out, f.path));
        if (rel === "assets/style.css") css = f.text;
        else if (rel === "assets/style.css.map") map = f.text;
        else ctx.emit(rel, f.contents);
      }
    } catch (e) {
      for (const m of esbuildErrors(e, config.root)) errors.push(`CSS: ${m}`);
      return undefined;
    }
  } else {
    const seen = new Set<string>(files);
    css = files.map((f) => bundle(f, ctx, seen)).join("\n") + "\n" + extra;
    if (config.css.minify) css = minifyCss(css);
  }
  const rel = fingerprinted("assets/style.css", css, config.fingerprint);
  if (map) {
    css += `\n/*# sourceMappingURL=${basename(rel)}.map */\n`;
    ctx.emit(`${rel}.map`, map);
  }
  ctx.emit(rel, css);
  return { url: `/${rel}`, integrity: integrity(css) };
}
