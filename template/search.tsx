// search.tsx - the search page
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

import { template } from "ggass";

export default template({
  fields: {},
  render: (page) => (
    <>
      <h1>{page.title}</h1>
      {"\n"}
      <site-search>
        <label class="field" for="search-q">Search this site</label>
        <input type="search" id="search-q" name="q" autofocus />
        <ol class="results"></ol>
      </site-search>
      {"\n"}
      <noscript>
        <p>
          Search needs JavaScript. Without it, start from the <a href="/">home page</a>.
        </p>
      </noscript>
    </>
  ),
});
