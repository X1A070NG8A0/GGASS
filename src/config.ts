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

// The site configuration: the object that a site passes to build().
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Step } from "./steps.ts";

export type NavItem = { href: string; label: string };

// "auto" uses esbuild if the site has it installed, and the built-in code if
// not. "esbuild" fails if esbuild is not installed.
export type Engine = "auto" | "esbuild" | "builtin";

export type ImageFormat = "avif" | "webp" | "jpeg" | "png";

export type FontConfig = {
  // The name for font-family in CSS.
  family: string;
  // The font file, relative to the site root: .ttf, .otf, .woff or .woff2.
  src: string;
  // "400", or a range such as "100 900" for a variable font.
  weight?: string | number;
  style?: "normal" | "italic" | "oblique";
  // font-display. The default is "swap".
  display?: string;
  // "auto" (the default) keeps the characters that the pages use. A string
  // keeps those characters. false keeps the whole font.
  subset?: "auto" | false | string;
  // Adds <link rel="preload"> to each page. Use it for the body text font.
  preload?: boolean;
  unicodeRange?: string;
};

export type CssConfig = {
  // The site stylesheet, relative to the root. It can @import other files.
  entry?: string;
  // Puts the GGASS stylesheet before the site stylesheet. The default is true.
  base?: boolean;
  minify?: boolean;
  sourcemap?: boolean;
  // Browsers to support, in esbuild form, for example ["chrome120", "safari17"].
  // esbuild lowers newer syntax, such as nesting, for these browsers.
  targets?: string[];
  engine?: Engine;
};

export type JsConfig = {
  // More custom elements: tag name to module file, relative to the root.
  // A page loads a module only when the page holds its element.
  components?: Record<string, string>;
  minify?: boolean;
  sourcemap?: boolean;
  // Browsers or language level, in esbuild form. The default is "es2022".
  target?: string[];
  engine?: Engine;
  // JSX in components: "automatic" needs jsxImportSource, "transform" uses
  // jsxFactory and jsxFragment. JSX needs esbuild.
  jsx?: "automatic" | "transform";
  jsxImportSource?: string;
  jsxFactory?: string;
  jsxFragment?: string;
};

export type ImagesConfig = {
  // Writes AVIF and WebP copies at several widths for each raster image in a
  // page, with srcset and sizes. "auto" (the default) does this when sharp is
  // installed.
  responsive?: boolean | "auto";
  widths?: number[];
  formats?: ImageFormat[];
  // Encoder quality, 1 to 100. Each encoder has its own default.
  quality?: number;
  // The sizes attribute: how wide the image shows at each screen width.
  sizes?: string;
};

export type SiteConfig = {
  name: string;
  lang?: string;
  nav?: NavItem[];
  // HTML at the bottom of each page.
  footer?: string;
  // The site folder. The default is the current folder.
  root?: string;
  // The pages, relative to the root. The default is "content".
  content?: string;
  // The output, relative to the root. The default is "dist".
  out?: string;
  // The cache for processed images and fonts. The default is
  // node_modules/.cache/ggass in the nearest node_modules folder.
  cache?: string;
  // Puts a content hash in each asset name, so browsers can keep assets.
  fingerprint?: boolean;
  // A table of contents for pages with at least `min` h2 and h3 headings.
  toc?: { min?: number } | false;
  // Single-key shortcuts. The reader can turn them off.
  shortcuts?: boolean;
  // A share button in the bar at the bottom of phones and tablets.
  share?: boolean;
  // A service worker that keeps the assets and the visited pages for
  // offline reading.
  offline?: boolean;
  css?: CssConfig;
  js?: JsConfig;
  images?: ImagesConfig | false;
  fonts?: FontConfig[];
  // More build steps, which run after the built-in ones.
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

// The nearest node_modules folder at or above `from`.
function nodeModules(from: string): string | undefined {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "node_modules"))) return join(dir, "node_modules");
    if (dirname(dir) === dir) return undefined;
  }
}

export function resolveConfig(site: SiteConfig): ResolvedConfig {
  const root = resolve(site.root ?? process.cwd());
  const at = (p: string) => resolve(root, p);
  const nm = nodeModules(root);
  const images = site.images === false ? false : site.images ?? {};
  return {
    name: site.name,
    lang: site.lang ?? "en",
    nav: site.nav ?? [],
    footer: site.footer ?? "",
    root,
    content: at(site.content ?? "content"),
    out: at(site.out ?? "dist"),
    cache: site.cache ? at(site.cache) : nm ? join(nm, ".cache", "ggass") : join(root, ".cache", "ggass"),
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
