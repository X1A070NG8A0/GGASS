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

import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import esbuild from "esbuild";
import type { Component } from "../components.ts";
import { slashes, type Asset, type BuildContext } from "../steps.ts";
import { integrity, shortHash } from "./hash.ts";
import { esbuildErrors } from "./optional.ts";

const CLIENT = join(import.meta.dirname, "..", "client");
const LOADER = join(CLIENT, "loader.ts");
const WORKER = join(CLIENT, "worker", "sw.ts");

const BANNER = "/*! GGASS components | Apache-2.0 OR LGPL-2.1-or-later */";

export type Scripts = {
  loader: Asset;
  modules: Map<string, Asset>;
  files: Asset[];
  imports: Map<string, string[]>;
};

export async function buildJs(ctx: BuildContext, components: Map<string, Component>): Promise<Scripts | undefined> {
  const { config, errors } = ctx;
  const result: Scripts = { loader: { url: "", integrity: "" }, modules: new Map(), files: [], imports: new Map() };
  const entries = [{ in: LOADER, out: "loader" }];
  for (const c of components.values()) if (c.client) entries.push({ in: c.client, out: c.tag });
  let built: esbuild.BuildResult<{ write: false; metafile: true }>;
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
    for (const m of esbuildErrors(e, config.root)) errors.push(`JavaScript: ${m}`);
    return undefined;
  }
  const byEntry = new Map(entries.map((e) => [resolve(e.in), e.out]));
  // The metafile names files relative to the site root.
  const urlOf = (metaPath: string) => "/" + slashes(relative(config.out, resolve(config.root, metaPath)));
  for (const f of built.outputFiles) {
    const rel = slashes(relative(config.out, f.path));
    ctx.emit(rel, f.contents);
    if (!rel.endsWith(".js")) continue;
    const meta = built.metafile.outputs[slashes(relative(config.root, f.path))] as esbuild.Metafile["outputs"][string] | undefined;
    const asset = { url: `/${rel}`, integrity: integrity(f.contents) };
    result.files.push(asset);
    result.imports.set(asset.url, (meta?.imports ?? []).filter((i) => i.kind === "import-statement" && !i.external).map((i) => urlOf(i.path)));
    const name = meta?.entryPoint ? byEntry.get(resolve(config.root, meta.entryPoint)) : undefined;
    if (name === "loader") result.loader = asset;
    else if (name) result.modules.set(name, asset);
  }
  return result;
}

// At /sw.js, so that the scope of the worker is the whole site. The
// addresses to keep have the base path already.
export async function buildServiceWorker(ctx: BuildContext, precache: string[]): Promise<void> {
  const { config } = ctx;
  const { code } = await esbuild.transform(readFileSync(WORKER, "utf8"), { loader: "ts", minify: config.js.minify, target: config.js.target });
  const version = `ggass-${shortHash(precache.join("\n"))}`;
  const constants = `const PRECACHE = ${JSON.stringify(precache)};\nconst VERSION = ${JSON.stringify(version)};\nconst BASE_PATH = ${JSON.stringify(config.basePath)};\n`;
  ctx.emit("sw.js", constants + code);
}
