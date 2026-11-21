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

import { basename, join, relative } from "node:path";
import esbuild from "esbuild";
import { slashes, type Asset, type BuildContext } from "../steps.ts";
import { fingerprinted, integrity } from "./hash.ts";
import { esbuildErrors } from "./optional.ts";

const BASE_CSS = join(import.meta.dirname, "..", "style", "ggass.css");

// Root-relative URLs stay as written. esbuild's `external: ["/*"]` also
// matches resolved file paths, so this is a plugin.
const rootRelative: esbuild.Plugin = {
  name: "root-relative",
  setup: (b) => void b.onResolve({ filter: /^\// }, (args) => (args.kind === "entry-point" ? undefined : { path: args.path, external: true })),
};

const FILE_LOADERS: Record<string, esbuild.Loader> = Object.fromEntries(
  ["woff2", "woff", "ttf", "otf", "png", "jpg", "jpeg", "gif", "svg", "webp", "avif"].map((ext) => [`.${ext}`, "file"]),
);

const importPath = (root: string, file: string): string => {
  const r = slashes(relative(root, file));
  return /^[a-z]:/i.test(r) || r.startsWith("../") ? r : `./${r}`;
};

// Bundles one stylesheet: each @import goes inline, and each file that url()
// names gets a hashed name under assets/.
async function bundleCss(ctx: BuildContext, name: string, files: string[], extra: string): Promise<Asset | undefined> {
  const { config, errors } = ctx;
  const entry = files.map((f) => `@import ${JSON.stringify(importPath(config.root, f))};`).join("\n") + "\n" + extra;
  let css = "";
  let map: string | undefined;
  try {
    const result = await esbuild.build({
      // The entry has no file. Its name must not match a real file, or an
      // @import of that file looks like a cycle.
      stdin: { contents: entry, resolveDir: config.root, sourcefile: `<ggass ${name}>.css`, loader: "css" },
      bundle: true,
      write: false,
      minify: config.css.minify,
      sourcemap: config.css.sourcemap ? "external" : false,
      outfile: join(config.out, "assets", `${name}.css`),
      plugins: [rootRelative],
      loader: FILE_LOADERS,
      assetNames: config.fingerprint ? "[name]-[hash]" : "[name]",
      target: config.css.targets,
      logLevel: "silent",
    });
    for (const f of result.outputFiles) {
      const rel = slashes(relative(config.out, f.path));
      if (rel === `assets/${name}.css`) css = f.text;
      else if (rel === `assets/${name}.css.map`) map = f.text;
      else ctx.emit(rel, f.contents);
    }
  } catch (e) {
    for (const m of esbuildErrors(e, config.root)) errors.push(`CSS: ${m}`);
    return undefined;
  }
  const rel = fingerprinted(`assets/${name}.css`, css, config.fingerprint);
  if (map) {
    css += `\n/*# sourceMappingURL=${basename(rel)}.map */\n`;
    ctx.emit(`${rel}.map`, map);
  }
  ctx.emit(rel, css);
  return { url: `/${rel}`, integrity: integrity(css) };
}

export function buildCss(ctx: BuildContext, extra: string): Promise<Asset | undefined> {
  const { config } = ctx;
  const files = [...(config.css.base ? [BASE_CSS] : []), ...(config.css.entry ? [config.css.entry] : [])];
  if (!files.length && !extra) return Promise.resolve(undefined);
  return bundleCss(ctx, "style", files, extra);
}

// The stylesheet of one component. A page links it only if it uses the
// component.
export const buildComponentCss = (ctx: BuildContext, tag: string, file: string): Promise<Asset | undefined> => bundleCss(ctx, tag, [file], "");
