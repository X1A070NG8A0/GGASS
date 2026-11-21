// templates.ts - template(), frame() and component(), and the compile step for template/
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

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";
import { esbuildErrors } from "./assets/optional.ts";
import { shortHash } from "./assets/hash.ts";
import type { ResolvedConfig } from "./config.ts";
import type { Child, Html } from "./jsx-runtime.ts";
import type { Fields, InferFields } from "./schema.ts";
import { slashes } from "./steps.ts";

export type TocEntry = { level: number; id: string; text: string };

// What every page has, whatever its template.
export type PageMeta = { url: string; file: string; template: string; title: string; kind: string; id?: string };
export type AnyPage = PageMeta & { readonly [key: string]: unknown };
export type Page<F extends Fields = Fields> = { [K in keyof (PageMeta & InferFields<F>)]: (PageMeta & InferFields<F>)[K] } & {};

// The site as a template sees it.
export type Site = {
  readonly config: ResolvedConfig;
  // The YAML files in data/, by name: data/tools.yaml is data.tools. The
  // values are `any`, because only the template knows their shape.
  readonly data: { readonly [name: string]: any };
  // A page by its address, for example "/ops/air-filter.html" or "/book/".
  page(address: string): AnyPage | undefined;
  pages(): AnyPage[];
  children(page: PageMeta): AnyPage[];
  parent(page: PageMeta): AnyPage | undefined;
};

const KIND = Symbol.for("ggass.template");

export type Template<F extends Fields = Fields> = {
  readonly [KIND]: "template";
  readonly fields: F;
  readonly extra: boolean;
  render(page: Page<F>, site: Site): Html | string;
};

export type TemplateSpec<F extends Fields> = {
  fields: F;
  // Allow keys that the fields do not list.
  extra?: boolean;
  render(page: Page<F>, site: Site): Html | string;
};

export const template = <F extends Fields>(spec: TemplateSpec<F>): Template<F> => ({ [KIND]: "template", fields: spec.fields, extra: spec.extra ?? false, render: spec.render });

export type FrameInput = { page: AnyPage; toc: TocEntry[]; body: Html; head: Html };
export type Frame = { readonly [KIND]: "frame"; render(input: FrameInput, site: Site): Html | string };

// The frame puts each page body in the full HTML document.
export const frame = (render: Frame["render"]): Frame => ({ [KIND]: "frame", render });

export type ComponentProps<F extends Fields> = InferFields<F> & { children?: Child };
export type Component<F extends Fields = Fields> = ((props: ComponentProps<F>) => Html) & { readonly tag: string; readonly props: F };

// A component for templates: <SideNote kind="tip">. The type check tests
// the props against the fields.
export function component<F extends Fields>(spec: { tag: string; props: F; render(props: ComponentProps<F>): Html }): Component<F> {
  return Object.assign((props: ComponentProps<F>) => spec.render(props), { tag: spec.tag, props: spec.props });
}

export type LoadedTemplate = { template: Template; file: string; version: string };
export type Templates = { pages: Map<string, LoadedTemplate>; frame: { frame: Frame; file: string; version: string } };

const GGASS_TEMPLATES = join(import.meta.dirname, "..", "template");

// "ggass" in a template must be this copy of GGASS, so that the template and
// the build share one module (and one Html class).
const GGASS_MODULES: Record<string, string> = {
  ggass: join(import.meta.dirname, "index.ts"),
  "ggass/jsx-runtime": join(import.meta.dirname, "jsx-runtime.ts"),
};
const ggassPlugin: esbuild.Plugin = {
  name: "ggass",
  setup(b) {
    b.onResolve({ filter: /^ggass(\/.*)?$/ }, (args) => {
      const file = GGASS_MODULES[args.path];
      return file ? { path: pathToFileURL(file).href, external: true } : { errors: [{ text: `"${args.path}" is not a module of GGASS` }] };
    });
  },
};

// The top-level .tsx and .ts files of a folder. Subfolders hold helpers.
function templateFiles(dir: string): Map<string, string> {
  const found = new Map<string, string>();
  if (!existsSync(dir)) return found;
  for (const e of readdirSync(dir, { withFileTypes: true }))
    if (e.isFile() && /\.tsx?$/.test(e.name) && !e.name.endsWith(".d.ts")) found.set(e.name.replace(/\.tsx?$/, ""), join(dir, e.name));
  return found;
}

process.setSourceMapsEnabled(true);

export async function loadTemplates(config: ResolvedConfig, errors: string[]): Promise<Templates | undefined> {
  const files = new Map([...templateFiles(GGASS_TEMPLATES), ...templateFiles(config.template)]);
  const display = (file: string) => (file.startsWith(config.root) ? slashes(relative(config.root, file)) : `ggass/template/${relative(GGASS_TEMPLATES, file)}`);
  const outdir = join(config.cache, "templates");
  let built: esbuild.BuildResult<{ write: false }>;
  try {
    built = await esbuild.build({
      entryPoints: [...files].map(([name, file]) => ({ in: file, out: name })),
      bundle: true,
      splitting: true,
      format: "esm",
      platform: "node",
      target: "node24",
      packages: "external",
      jsx: "automatic",
      jsxImportSource: "ggass",
      sourcemap: "inline",
      write: false,
      outdir,
      entryNames: "[name]",
      chunkNames: "chunk-[hash]",
      outExtension: { ".js": ".mjs" },
      plugins: [ggassPlugin],
      absWorkingDir: config.root,
      logLevel: "silent",
    });
  } catch (e) {
    for (const m of esbuildErrors(e, config.root)) errors.push(`template: ${m}`);
    return undefined;
  }
  // A new folder for each new output, because Node keeps each module that it
  // loaded under its address.
  const version = shortHash(...built.outputFiles.map((f) => f.path + "\0" + f.text));
  const dir = join(outdir, version);
  if (!existsSync(dir)) {
    for (const f of built.outputFiles) {
      const path = join(dir, relative(outdir, f.path));
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, f.contents);
    }
  }
  for (const old of readdirSync(outdir)) if (old !== version) rmSync(join(outdir, old), { recursive: true, force: true });

  const pages = new Map<string, LoadedTemplate>();
  let frameFound: Templates["frame"] | undefined;
  for (const [name, file] of files) {
    const out = built.outputFiles.find((f) => slashes(relative(outdir, f.path)) === `${name}.mjs`);
    if (!out) continue;
    let mod: { default?: { [KIND]?: string } };
    try {
      mod = (await import(pathToFileURL(join(dir, `${name}.mjs`)).href)) as typeof mod;
    } catch (e) {
      errors.push(`${display(file)}: ${(e as Error).stack ?? String(e)}`);
      continue;
    }
    const v = shortHash(out.text);
    const kind = mod.default?.[KIND];
    if (name === "frame") {
      if (kind === "frame") frameFound = { frame: mod.default as Frame, file: display(file), version: v };
      else errors.push(`${display(file)}: the default export must be frame(...)`);
    } else if (kind === "template") pages.set(name, { template: mod.default as Template, file: display(file), version: v });
    else errors.push(`${display(file)}: the default export must be template({ fields, render })`);
  }
  if (!frameFound) return undefined;
  return { pages, frame: frameFound };
}
