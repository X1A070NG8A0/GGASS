// index.ts - the public interface of GGASS
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

import type { SiteConfig } from "./config.ts";

export { build, type BuildOptions, type BuildResult } from "./build.ts";
export { serve, type ServeOptions } from "./serve.ts";
export { resolveConfig, type CssConfig, type Engine, type FontConfig, type ImageFormat, type ImagesConfig, type JsConfig, type NavItem, type ResolvedConfig, type SiteConfig } from "./config.ts";
export type { Page, TocEntry } from "./content.ts";
export type { Asset, BuildContext, Step } from "./steps.ts";
export { esc, textOf } from "./html.ts";
export { minifyCss } from "./assets/css.ts";
export { integrity } from "./assets/hash.ts";
export { readDimensions, type Size } from "./assets/dimensions.ts";
export { readExif, type Exif } from "./assets/exif.ts";
export { imageMetadata, parseImageSpec, processImage, type ImageMetadata, type ImageOps, type ImageOverlay, type ImageResult } from "./assets/images.ts";

export const defineSite = (site: SiteConfig): SiteConfig => site;
