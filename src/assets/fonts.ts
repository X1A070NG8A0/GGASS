// fonts.ts - font processing
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

// Font processing: keep only the characters that the site uses (subsetting),
// convert the font to WOFF2, put a content hash in the name, write the
// @font-face rules, and add preload links.
//
// Subsetting and conversion need subset-font (HarfBuzz compiled to
// WebAssembly). Without it, a font must already be WOFF2, and it is used
// whole.
import { readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import type { FontConfig } from "../config.ts";
import type { BuildContext } from "../steps.ts";
import { cached, fingerprinted, shortHash } from "./hash.ts";
import { optional } from "./optional.ts";

type SubsetFont = (font: Uint8Array, text: string, options?: { targetFormat?: "woff2" | "woff" | "truetype" | "sfnt" }) => Promise<Uint8Array>;
type FontVerter = { convert(font: Uint8Array, to: "woff2"): Promise<Uint8Array> };

// Characters that scripts and the layout can show, kept in every subset.
const ALWAYS = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("") + "‘’“”–—…•·×→←↑↓↩ ";

export type Fonts = { css: string; preloads: string[] };

export async function buildFonts(ctx: BuildContext, siteText: string): Promise<Fonts> {
  const { config, errors, warnings } = ctx;
  const fonts: Fonts = { css: "", preloads: [] };
  if (!config.fonts.length) return fonts;
  const subsetFont = await optional<SubsetFont>("subset-font", config.root);
  const used = [...new Set(siteText + ALWAYS)].sort().join("");
  let warned = false;

  for (const font of config.fonts) {
    const path = resolve(config.root, font.src);
    let input: Buffer;
    try {
      input = readFileSync(path);
    } catch {
      errors.push(`fonts: "${font.src}" not found`);
      continue;
    }
    const isWoff2 = extname(path).toLowerCase() === ".woff2";
    let data: Uint8Array;
    if (font.subset !== false && subsetFont) {
      const chars = font.subset === undefined || font.subset === "auto" ? used : [...new Set(font.subset + " ")].join("");
      data = await cached(`${config.cache}/fonts`, `${shortHash(input, chars)}.woff2`, () => subsetFont(input, chars, { targetFormat: "woff2" }));
    } else if (isWoff2) {
      if (font.subset !== false && !warned) {
        warnings.push("fonts: subset-font is not installed, so fonts are used whole. Install it in the site: npm install --save-dev subset-font");
        warned = true;
      }
      data = input;
    } else {
      // No subset: convert only. fontverter comes with subset-font.
      const verter = await optional<FontVerter>("fontverter", config.root);
      if (!verter) {
        errors.push(`fonts: "${font.src}" is not WOFF2. Convert it, or install subset-font: npm install --save-dev subset-font`);
        continue;
      }
      data = await cached(`${config.cache}/fonts`, `${shortHash(input, "whole")}.woff2`, () => verter.convert(input, "woff2"));
    }
    const rel = fingerprinted(`assets/fonts/${basename(path, extname(path))}.woff2`, data, config.fingerprint);
    ctx.emit(rel, data);
    fonts.css += fontFace(font, `/${rel}`);
    if (font.preload) fonts.preloads.push(`<link rel="preload" href="/${rel}" as="font" type="font/woff2" crossorigin>`);
  }
  return fonts;
}

function fontFace(font: FontConfig, url: string): string {
  return `@font-face {
  font-family: "${font.family.replace(/["\\\n]/g, "")}";
  src: url("${url}") format("woff2");
  font-weight: ${font.weight ?? 400};
  font-style: ${font.style ?? "normal"};
  font-display: ${font.display ?? "swap"};${font.unicodeRange ? `\n  unicode-range: ${font.unicodeRange};` : ""}
}
`;
}
