// tab.tsx - a tab page: a link back to its parent page, a title and a body
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

import { html, template } from "ggass";

export default template({
  fields: { body: html() },
  render: (page, site) => {
    const parent = site.parent(page);
    return (
      <>
        {parent && (
          <p class="crumb">
            <a href={parent.url.replace(/index\.html$/, "")}>{parent.title}</a>
          </p>
        )}
        <h1>{page.title}</h1>
        {"\n"}
        {page.body}
      </>
    );
  },
});
