// home.tsx - the home page of the test site: a lede, a search field, and cards from data/cards.yaml
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

import { template, text } from "ggass";

type Card = { href: string; label: string; text: string };

export default template({
  fields: { lede: text() },
  render: (page, site) => (
    <>
      <h1 class="brandmark">{site.config.name}</h1>
      {"\n"}
      <p class="lede">{page.lede}</p>
      {"\n"}
      <site-search>
        <form class="home-search" action="/search.html">
          <label class="field" for="home-q">Search this site</label>
          <input type="search" id="home-q" name="q" />
        </form>
      </site-search>
      {"\n"}
      <ul class="cards">
        {(site.data.cards as Card[]).map((c) => (
          <li>
            <a href={c.href}>{c.label}</a>
            <span>{c.text}</span>
          </li>
        ))}
      </ul>
    </>
  ),
});
