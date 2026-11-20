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

// The test site. It uses each element, side notes, processed images and a
// site stylesheet, as a real site would.
//
//   node test/fixture/build.ts            build into dist/ at the repository root
//   node test/fixture/build.ts --check    check the pages and links only
//   node test/fixture/build.ts --serve    build, then serve on http://127.0.0.1:4000
import { join } from "node:path";
import { build, defineSite, serve } from "ggass";

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

if (import.meta.main) {
  const result = await build(site, { check: process.argv.includes("--check") });
  if (result.ok && process.argv.includes("--serve")) serve(site);
}
