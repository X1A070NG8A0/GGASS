<!--
SPDX-FileCopyrightText: 2026 GGASS project
SPDX-License-Identifier: Apache-2.0 OR LGPL-2.1-or-later
-->

# ggass

GGASS is a static site generator that a site uses as a library. The site has
its own build script, which imports GGASS and calls `build()`. You write each
page as an HTML file with a YAML header. The build gives each page the shared
layout, a table of contents and side notes. It checks the links, processes
the CSS, JavaScript, images and fonts, and writes the site.

The reader gets plain HTML. JavaScript adds conveniences, such as popup
previews and folded notes, and never gates content.

## Use it in a site

GGASS is TypeScript that Node runs directly, with no compile step. Node does
not strip types from files inside a real `node_modules` folder, so a site
installs GGASS as a linked folder. A `file:` dependency does this:

```json
{
  "type": "module",
  "scripts": { "build": "node build.ts", "serve": "node build.ts --serve" },
  "dependencies": { "ggass": "file:../ggass" },
  "devDependencies": { "esbuild": "0.28.2", "sharp": "0.35.5", "subset-font": "2.9.0" }
}
```

The three development packages are optional. The section "Processing" says
what each one adds.

The build script of the site, `build.ts`:

```ts
import { build, defineSite, serve } from "ggass";

const site = defineSite({
  name: "My site",
  nav: [{ href: "/guide/", label: "Guide" }, { href: "/search.html", label: "Search" }],
  css: { entry: "style.css" },
});

const result = await build(site, { check: process.argv.includes("--check") });
if (result.ok && process.argv.includes("--serve")) serve(site);
```

You need Node 24 or later. Then:

```sh
npm install
npm run build      # check the links, then write dist/
npm run serve      # build, then http://127.0.0.1:4000
```

If the build finds an error, it prints the error and sets the exit code
to 1. `build()` also returns the errors, the warnings, the files that it
wrote and the time of each step. With `{ check: true }`, it checks the pages
and the links and writes nothing.

## Configuration

All settings except `name` are optional.

| Setting | Default | What it does |
| --- | --- | --- |
| `name` | | The site name, in the header and the page titles |
| `lang` | `"en"` | The language of the pages |
| `nav` | `[]` | The header links, as `{ href, label }` |
| `footer` | none | HTML at the bottom of each page |
| `root` | the current folder | The site folder. The paths below are relative to it. |
| `content` | `"content"` | The pages and their files |
| `out` | `"dist"` | The output folder. The build deletes it first. |
| `cache` | `node_modules/.cache/ggass` | Processed images and fonts, kept between builds |
| `fingerprint` | `true` | A content hash in each asset name |
| `toc` | `{ min: 3 }` | A table of contents on pages with at least `min` h2 and h3 headings. `false` turns it off. |
| `shortcuts` | `true` | Single-key shortcuts for keyboard readers |
| `share` | `true` | A share button in the bar at the bottom of phones and tablets |
| `offline` | `false` | A service worker for offline reading |
| `css` | | `entry`, `base`, `minify`, `sourcemap`, `targets`, `engine` |
| `js` | | `components`, `minify`, `sourcemap`, `target`, `engine`, and the JSX settings |
| `images` | | `responsive`, `widths`, `formats`, `quality`, `sizes`. `false` turns off image work. |
| `fonts` | `[]` | Font files, as `{ family, src, weight, style, subset, preload }` |
| `steps` | `[]` | More build steps. See "Build steps". |

`src/config.ts` describes each setting.

## Pages

Each page is an HTML file in the content folder that starts with a YAML
header inside an HTML comment:

```html
<!--
title: Getting started
kind: Guide
-->
<h1>Getting started</h1>
<p>Body HTML.</p>
```

The `<!--` and `-->` lines must be the first line and the line after the
YAML. Because the header is a comment, a browser that opens the file
directly does not show it.

The `title` is necessary. It goes in the `<title>` element and in the search
results. The `kind` is the label in the search results, and the default is
"Page". The body holds its own `<h1>`.

The path in the content folder is the address of the page:
`content/guide/start.html` becomes `/guide/start.html`. The build copies the
other files in the content folder, for example images, to the same path.

If a root-relative link (an `href`, `src` or `action` that starts with `/`)
has no target, the build stops. A target is a page, a file from the content
folder, a generated file or an asset.

### What the build adds to a page

- Table of contents. Each h2 and h3 gets an ID from its text, if it has
  none. A page with enough headings gets a table of contents. A heading with
  `data-notoc` stays out of it.
- Side notes. Write `<side-note>The note.</side-note>` in a paragraph, list
  item or table cell. The build puts a numbered reference in its place and
  moves the note to the end of the paragraph. It also writes the notes as a
  list at the end of the page, for print.
- Popup links. Put a bare `data-pop` attribute on a link to a page, for
  example `<a href="/guide/start.html" data-pop>`. The build wraps the link
  in `<pop-link>` and writes the body of the target page under `/frag/`.
- Images. Each `<img>` of a file in the content folder gets its `width` and
  `height`, `decoding="async"`, and `loading="lazy"` after the first image.
  See "Processing".

## Presentations

Each page is one HTML document with two presentations. Media queries on the
screen width and on the input (`hover`, `pointer`) choose between them. The
build does no browser sniffing.

| | Wide screen (72rem and more) | Narrow screen |
| --- | --- | --- |
| Layout | The table of contents in a column on the left, the text, and a margin on the right | One column |
| Table of contents | Stays in view, and marks the current section | A box at the top of the page. On a touch screen, it opens as a sheet from the Contents button. |
| Side notes | In the margin, beside their reference (CSS anchor positioning). A script moves a note down if it would cover the note before it. | Under their paragraph. A script folds them, and a tap on the number opens a note. Find in page still finds folded text. |
| Popup links | A mouse pointer opens a preview window. Pin a window to keep it, drag it by its title bar, and use "tile" to put the pinned windows side by side. | A tap opens the page in a sheet from the bottom of the screen, with a link to the full page |
| Page tools | Keyboard shortcuts (press `?`) | On a touch screen only: a bar at the bottom, in reach of the thumb, with contents, search, share and top |

On phones, the layout uses the safe areas of screens with a notch and
dynamic viewport units (`dvh`). Nothing fades or slides: pages, tabs, popup
windows and sheets show at once.

Print is a third presentation. It has no navigation, the notes print as a
list at the end of the page, and external links print their address.

The keyboard shortcuts are `?` (the list), `/` (search), `j` and `k` (next
and previous section), `t` (table of contents), `p` (preview the link that
has focus) and Escape (close the popup windows). The list has a switch that
turns the single keys off, as WCAG 2.1.4 requires. A "Keyboard shortcuts"
button shows when it gets keyboard focus, after the skip link.

With `offline: true`, a service worker keeps the stylesheet, the scripts,
the home page and each page that the reader opens.

## Processing

The build processes the assets with its own TypeScript code. Three optional
packages add more. A site installs only the ones that it needs, and the
build finds them in the site folder.

| | Without the package | With the package |
| --- | --- | --- |
| CSS | Bundles each relative `@import`, copies the files that `url()` names, minifies, hashes the name, gives the integrity value | esbuild also lowers new syntax for `css.targets` and writes a source map |
| JavaScript | Strips the TypeScript types with Node, points each import at the hashed file, gives the integrity values | esbuild also bundles, removes unused code (tree shaking), minifies, reads JSX and writes source maps |
| Images | Reads the width and height of PNG, GIF, JPEG, WebP and SVG files | sharp also applies `data-image` operations, writes AVIF and WebP copies at several widths with `srcset` and `sizes`, and reads metadata |
| Fonts | Uses WOFF2 files whole | subset-font keeps only the characters that the site uses and converts other formats to WOFF2 |

`css.engine` and `js.engine` choose the route: `"auto"` (the default) uses
esbuild if it is installed, `"esbuild"` requires it, and `"builtin"` never
uses it. `images.responsive` is `"auto"` by default, so the responsive copies
start when sharp is installed.

Each asset name holds a hash of its content, so a browser can keep the file
for a long time. Each `<link>` and `<script>` carries its Subresource
Integrity value (`integrity="sha384-..."`), and so does each module in the
import map. A browser refuses a file whose content does not match.

### JavaScript on a page

Each custom element has its own module. A page loads one small loader. The
loader looks for elements that are not defined yet and loads their modules
through the import map of the page. The page also preloads the modules for
the elements that it holds. So a page loads only the code that it uses, and
an element that arrives later (in a popup window) still starts.

The browser code of GGASS is TypeScript in `src/client/`. A site adds its own
elements with `js.components`:

```ts
js: { components: { "word-count": "components/word-count.ts" } }
```

### Image operations

A `data-image` attribute on an `<img>` applies operations at build time:

```html
<img src="/photos/hill.jpg" alt="..." data-image="crop=4:3 position=north grayscale text='© 2026'">
```

| Operation | Example |
| --- | --- |
| Resize (the image never grows) | `resize=800x600`, `resize=800x`, `fit=cover`, `position=attention` |
| Crop | `crop=4:3`, `crop=800x600`, `crop=800x600+40+20` |
| Rotate and mirror | `rotate=90`, `flip`, `flop` |
| Colors | `brightness=1.1`, `saturation=0.8`, `hue=30`, `lightness=10`, `contrast=1.2`, `gamma=2.2` |
| Filters | `grayscale`, `sepia`, `negate`, `normalize`, `sharpen`, `blur=2`, `tint=#704214`, `threshold=128` |
| Overlay an image | `overlay=/logo.png`, `overlay-gravity=southeast`, `overlay-opacity=0.6`, `overlay-width=120` |
| Overlay text | `text="© 2026"`, `text-gravity=southwest`, `text-size=24`, `text-color=#fff` |
| Output | `format=webp`, `quality=75`, `background=#fff` |

An unknown operation or a bad value stops the build. In code,
`processImage()`, `imageMetadata()` and `parseImageSpec()` do the same work.
`imageMetadata()` also reads the EXIF fields: camera, lens, exposure, date,
orientation and GPS position.

### Build steps

The build runs these steps in order: load, pages, images, links, fonts, css,
js, layout, offline and write. It prints the time of each step. A site adds
its own steps. A `page` hook runs after the images step, and a `site` hook
runs after the js step:

```ts
steps: [{
  name: "word count",
  page: (body, page, ctx) => body,            // runs for each page, returns the new body
  site: (ctx) => ctx.emit("stats.json", "{}"), // runs once, before the layout
}]
```

A step can add an error (`ctx.errors`), a warning (`ctx.warnings`), a file
(`ctx.emit`) or HTML for the head of each page (`ctx.head`).

## Elements

Each element wraps plain HTML that works without JavaScript.
`test/fixture/content/elements/index.html` shows the markup of each one.

| Element | With JavaScript | Without JavaScript |
| --- | --- | --- |
| `<pop-link>` | A preview window (mouse) or a sheet (touch) | A link |
| `<check-list>` | Keeps the ticks in `localStorage` | Checkboxes |
| `<list-filter>` | Filters a list on the page | Hidden |
| `<site-search>` | Searches `search-index.json` | Hidden, with a note on the search page |
| `<section-tabs>` | Swaps a section in place from the page of the tab | Links to the tab pages |
| `<step-sequence>` | Steps through a numbered order in a drawing | Drawing and numbered list |
| `<photo-zoom>` | Opens the photo large in a dialog | A link to the image file |
| `<side-note>` | Folds and opens notes, keeps margin notes apart | Notes after their paragraph, or in the margin |
| `<page-toc>` | Marks the current section, closes the sheet | A list of links |
| `<key-shortcuts>` | Single-key shortcuts and their list | Nothing |
| `<share-button>` | Opens the share sheet of the device. Hidden where the browser has none. | Hidden |

The layout holds `<page-toc>`, `<key-shortcuts>` and `<share-button>`. The
build puts `<pop-link>` around each `data-pop` link and turns each
`<side-note>` into a reference and a note. You write the other elements in
the pages.

### Keyboard and screen readers

| Element | Keyboard | Screen reader |
| --- | --- | --- |
| `<pop-link>` | `p` on a focused popup link opens the preview and moves the focus into it. Tab reaches its links and buttons. Escape closes the windows that are not pinned and returns the focus to the link. A small "p: preview" label shows on a focused popup link while the single keys are on. | A link. The window is a dialog named by its title bar. Its buttons have names ("Keep this window open", "Close window"), and the pin button says whether it is pressed. |
| `<side-note>` | Enter on a note number opens the note (narrow screen) or moves the focus to the note in the margin (wide screen). Enter on the number at the start of a note goes back to the reference. | The reference is "Note 1". On a narrow screen it says whether its note is open. The note itself is a note named "Note 1". |
| `<page-toc>` | Tab through the links. On a touch screen, the Contents button opens the sheet, and Escape or a link closes it. | A navigation area named "Contents". The current section has `aria-current`. |
| `<key-shortcuts>` | `?`, or the "Keyboard shortcuts" button after the skip link, opens the list. Its switch turns the single keys off. | A dialog with a list of keys. |
| `<check-list>` | Space ticks a box. | Native checkboxes. |
| `<list-filter>` | Type in the field. | The field has a visible label. A live region says how many items show. |
| `<site-search>` | `/` goes to the field. | The field has a visible label. A live region says how many results there are. |
| `<section-tabs>` | Enter on a tab link. The focus moves to the new current tab. | Links. The current tab has `aria-current`. |
| `<step-sequence>` | The Previous and Next buttons. | A live region says the current step. |
| `<photo-zoom>` | Enter opens the photo, and Escape closes it. The focus goes back to the link. | A modal dialog named after the caption. |

### Accessibility defaults of the theme

- Sizes are in `rem`, so the text follows the font size that the reader
  sets in the browser.
- Each focusable element shows a 3-pixel focus outline with at least 3:1
  contrast in both themes. Field and button borders also have 3:1 contrast
  (WCAG 1.4.11).
- When the reader asks for more contrast in the system settings, the colors
  get darker in the light theme and lighter in the dark theme.
- In Windows contrast themes, popups, sheets and dialogs keep a strong
  border, and the current step, section and tab keep a mark that is not
  only a color.
- Each target is at least 24 pixels (WCAG 2.5.8). On touch screens, buttons
  in popups are 44 pixels, and an invisible area around each note number
  takes the tap.
- On a phone, the browser scrolls a focused element above the bottom bar,
  never under it (WCAG 2.4.11).
- Long words and addresses break, and code blocks scroll in their own box,
  so the page does not scroll sideways at 400% zoom.
- Fields have visible labels. Placeholder text has the contrast of body
  text.
- Nothing moves, fades or slides.

## Develop GGASS

```sh
npm install
npm run check      # type-check the library, the browser code and the service worker
npm test           # build the test site with and without the optional packages, and check it
npm run fixture    # build the test site into dist/
npm run serve      # build the test site, then serve it on http://127.0.0.1:4000
```

`test/fixture/` is the test site. It uses each element, side notes, image
operations and a site stylesheet. The font test needs a
TrueType font from the system, and it is skipped if it finds none.

## Limits

- GGASS cannot go on the npm registry as it is. Node does not strip types
  inside `node_modules`, so a registry package needs a step that writes
  JavaScript files first.
- The build finds tags with regular expressions. It does not parse a
  document tree.
- The built-in JavaScript route does not bundle or minify, and it does not
  read JSX.

## License

You can use GGASS under the Apache License 2.0 or under the GNU LGPL 2.1
or later, at your option (SPDX: `Apache-2.0 OR LGPL-2.1-or-later`). The
LGPL option is for software under the GNU GPL version 2, because the Free
Software Foundation considers Apache 2.0 incompatible with that version.
`LICENSE.txt` gives the details, and `LICENSES/` holds the full texts.

Each file names its copyright holder and license in an SPDX header. For
the files that cannot hold a comment, `REUSE.toml` gives this information.
The layout follows the [REUSE specification](https://reuse.software).
