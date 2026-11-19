<!--
SPDX-FileCopyrightText: 2026 GGASS project
SPDX-License-Identifier: Apache-2.0 OR LGPL-2.1-or-later
-->

# ggass

A static site generator. You write each page as an HTML file with a YAML
header. The build puts each page in a shared layout, checks the links and
writes a search index. Small browser elements add popup links, checklists,
filters, search and tabs, and each one works as plain HTML without
JavaScript. The site uses no libraries. `site.yaml` and the pages in
`content/` are placeholders.

## Run the site

```sh
npm install
npm run build      # check the links, then write dist/
npm run serve      # http://127.0.0.1:4000
```

`node site/build.ts --check` does the link check and writes nothing.
`npm run check` type-checks the build (TypeScript, run by Node directly) and
the browser code. To use a different port, set `PORT`.

## Content

`site.yaml` holds the site name, the header links and the footer. Each page
is an HTML file in `content/` that starts with a YAML header:

```html
---
title: Getting started
kind: Guide
---
<h1>Getting started</h1>
<p>Body HTML.</p>
```

The `title` is necessary. It goes in the `<title>` element and in the search
results. The `kind` is the label in the search results, and the default is
"Page". The body holds its own `<h1>`. The build adds only the layout.

The path in `content/` is the address of the page: `content/guide/start.html`
becomes `/guide/start.html`. The build copies the other files in `content/`,
for example images, to the same path.

The build does these steps:

1. It writes each page in the layout, and the body alone under `/frag/` for the popup windows.
2. It writes `/search.html` and `/search-index.json` with the text of each page.
3. It copies the stylesheet and the browser code to `/assets/`.

If a root-relative link (an `href`, `src` or `action` that starts with `/`)
has no target, the build stops. A target is a page, a file from `content/`,
a generated file or an asset.

## Browser elements

The browser code in `site/client/` is plain JavaScript with JSDoc types, so
the build copies it as written. The site uses no libraries. Each module
defines one custom element, and each element wraps HTML that works without
JavaScript. `content/elements/index.html` shows the markup of each element.

| Element | With JavaScript | Without JavaScript |
| --- | --- | --- |
| `<pop-link>` | Pointing to the link opens the page in a popup window (`<pop-window>`). Links in that window open more windows. You can pin a window and drag it. | A link |
| `<check-list>` | Keeps the ticks in `localStorage` and moves ticked items down | Checkboxes |
| `<list-filter>` | Filters a list on the page | Hidden |
| `<site-search>` | Searches `search-index.json` | Hidden, with a note on the search page |
| `<section-tabs>` | Swaps a section in place from the page of the tab | Links to the tab pages |
| `<step-sequence>` | Steps through a numbered order in a drawing | Drawing and numbered list |
| `<photo-zoom>` | Opens the photo large in a dialog | A link to the image file |

You do not write `<pop-link>` in the content. Put a bare `data-pop` attribute
on a link to a page, for example `<a href="/guide/start.html" data-pop>`. The
build wraps the link and points it to the body of that page.

The popup windows use anchor positioning and invoker commands. If a browser
does not have them, JavaScript places the window and handles the buttons.

## License

You can use GGASS under the Apache License 2.0 or under the GNU LGPL 2.1
or later, at your option (SPDX: `Apache-2.0 OR LGPL-2.1-or-later`). The
LGPL option is for software under the GNU GPL version 2, because the Free
Software Foundation considers Apache 2.0 incompatible with that version.
`LICENSE.txt` gives the details, and `LICENSES/` holds the full texts.

Each file names its copyright holder and license in an SPDX header. For
the files that cannot hold a comment, `REUSE.toml` gives this information.
The layout follows the [REUSE specification](https://reuse.software).

## Tests

The project has no automated tests yet. `npm run check` and
`node site/build.ts --check` are the checks that exist.
