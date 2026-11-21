// build.ts - build script of the test site
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

import { join } from "node:path";
import { defineSite, run } from "ggass";

export const site = defineSite({
  name: "Example site",
  root: import.meta.dirname,
  out: join(import.meta.dirname, "..", "..", "dist"),
  nav: [
    { href: "/article.html", label: "Article" },
    { href: "/elements/", label: "Elements" },
    { href: "/search.html", label: "Search" },
  ],
  footer: "Placeholder content for the GGASS tests.",
  css: { entry: "style.css", sourcemap: true },
  js: { sourcemap: true },
  offline: true,
});

if (import.meta.main) await run(site);
