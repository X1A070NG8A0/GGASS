// steps.ts - the build context, step hooks and timings
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

import { sep } from "node:path";
import type { ResolvedConfig } from "./config.ts";
import type { Page } from "./content.ts";

export const slashes = (path: string): string => path.split(sep).join("/");

export const formatMs = (n: number): string => (n < 1000 ? `${n.toFixed(0)} ms` : `${(n / 1000).toFixed(2)} s`);

export type Asset = { url: string; integrity: string };

export type BuildContext = {
  config: ResolvedConfig;
  pages: Map<string, Page>;
  // The other files in the content folder, as root-relative URLs.
  files: string[];
  errors: string[];
  warnings: string[];
  // The files to write, by path relative to the output folder.
  outputs: Map<string, string | Uint8Array>;
  // HTML that goes in the <head> of each page.
  head: string[];
  // Adds a file to the output. `path` is relative to the output folder.
  emit(path: string, data: string | Uint8Array): void;
};

export type Step = {
  name: string;
  // Runs for each page after the built-in transforms. Returns the new body.
  page?(body: string, page: Page, ctx: BuildContext): string | Promise<string>;
  // Runs once after the assets and before the layout.
  site?(ctx: BuildContext): void | Promise<void>;
};

export class Timings {
  list: [string, number][] = [];

  async run<T>(name: string, work: () => T | Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await work();
    } finally {
      this.list.push([name, performance.now() - start]);
    }
  }

  report(): string {
    return this.list.map(([name, n]) => `${name} ${formatMs(n)}`).join(", ");
  }
}
