// config.ts - the site configuration
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

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Step } from "./steps.ts";

export type NavItem = { href: string; label: string };

// "auto" uses esbuild if the site has it installed, and the built-in code if
// not. "esbuild" fails if esbuild is not installed.
export type Engine = "auto" | "esbuild" | "builtin";

export type ImageFormat = "avif" | "webp" | "jpeg" | "png";

export type FontConfig = {
  family: string;
  src: string;
  weight?: string | number;
  style?: "normal" | "italic" | "oblique";
  display?: string;
  subset?: "auto" | false | string;
  preload?: boolean;
  unicodeRange?: string;
};

export type CssConfig = {
  entry?: string;
  base?: boolean;
  minify?: boolean;
  sourcemap?: boolean;
  targets?: string[];
  engine?: Engine;
};

export type JsConfig = {
  components?: Record<string, string>;
  minify?: boolean;
  sourcemap?: boolean;
  target?: string[];
  engine?: Engine;
  jsx?: "automatic" | "transform";
  jsxImportSource?: string;
  jsxFactory?: string;
  jsxFragment?: string;
};

export type ImagesConfig = {
  responsive?: boolean | "auto";
  widths?: number[];
  formats?: ImageFormat[];
  quality?: number;
  sizes?: string;
};

export type SiteConfig = {
  name: string;
  lang?: string;
  nav?: NavItem[];
  footer?: string;
  root?: string;
  content?: string;
  // The output, relative to the root. The default is "dist". Each build
  // deletes it first.
  out?: string;
  cache?: string;
  fingerprint?: boolean;
  toc?: { min?: number } | false;
  shortcuts?: boolean;
  share?: boolean;
  offline?: boolean;
  css?: CssConfig;
  js?: JsConfig;
  images?: ImagesConfig | false;
  fonts?: FontConfig[];
  steps?: Step[];
};

export type ResolvedConfig = {
  name: string;
  lang: string;
  nav: NavItem[];
  footer: string;
  root: string;
  content: string;
  out: string;
  cache: string;
  fingerprint: boolean;
  toc: { min: number } | false;
  shortcuts: boolean;
  share: boolean;
  offline: boolean;
  css: Required<Omit<CssConfig, "entry" | "targets">> & { entry?: string; targets?: string[] };
  js: Required<Omit<JsConfig, "jsx" | "jsxImportSource" | "jsxFactory" | "jsxFragment">> & Pick<JsConfig, "jsx" | "jsxImportSource" | "jsxFactory" | "jsxFragment">;
  images: (Required<Omit<ImagesConfig, "quality">> & { quality?: number }) | false;
  fonts: FontConfig[];
  steps: Step[];
};

function nearestNodeModules(from: string): string | undefined {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "node_modules"))) return join(dir, "node_modules");
    if (dirname(dir) === dir) return undefined;
  }
}

export function resolveConfig(site: SiteConfig): ResolvedConfig {
  const root = resolve(site.root ?? process.cwd());
  const at = (p: string) => resolve(root, p);
  const nodeModulesDir = nearestNodeModules(root);
  const images = site.images === false ? false : site.images ?? {};
  return {
    name: site.name,
    lang: site.lang ?? "en",
    nav: site.nav ?? [],
    footer: site.footer ?? "",
    root,
    content: at(site.content ?? "content"),
    out: at(site.out ?? "dist"),
    cache: site.cache ? at(site.cache) : nodeModulesDir ? join(nodeModulesDir, ".cache", "ggass") : join(root, ".cache", "ggass"),
    fingerprint: site.fingerprint ?? true,
    toc: site.toc === false ? false : { min: site.toc?.min ?? 3 },
    shortcuts: site.shortcuts ?? true,
    share: site.share ?? true,
    offline: site.offline ?? false,
    css: {
      entry: site.css?.entry ? at(site.css.entry) : undefined,
      base: site.css?.base ?? true,
      minify: site.css?.minify ?? true,
      sourcemap: site.css?.sourcemap ?? false,
      targets: site.css?.targets,
      engine: site.css?.engine ?? "auto",
    },
    js: {
      components: Object.fromEntries(Object.entries(site.js?.components ?? {}).map(([tag, file]) => [tag, at(file)])),
      minify: site.js?.minify ?? true,
      sourcemap: site.js?.sourcemap ?? false,
      target: site.js?.target ?? ["es2022"],
      engine: site.js?.engine ?? "auto",
      jsx: site.js?.jsx,
      jsxImportSource: site.js?.jsxImportSource,
      jsxFactory: site.js?.jsxFactory,
      jsxFragment: site.js?.jsxFragment,
    },
    images: images && {
      responsive: images.responsive ?? "auto",
      widths: images.widths ?? [400, 800, 1200, 1600],
      formats: images.formats ?? ["avif", "webp"],
      quality: images.quality,
      sizes: images.sizes ?? "(width >= 72rem) 38rem, calc(100vw - 32px)",
    },
    fonts: site.fonts ?? [],
    steps: site.steps ?? [],
  };
}
