<!--
SPDX-FileCopyrightText: 2026 GGASS project
SPDX-License-Identifier: Apache-2.0 OR LGPL-2.1-or-later
-->

# ggass

GGASS is a static site generator that a site uses as a library. The site has
its own build script, which imports GGASS and calls `run()`. You write each
page as a YAML file, and a TSX template turns it into HTML. The build gives
each page the shared frame, a table of contents and side notes. It checks
the pages and the links, processes the CSS, JavaScript, images and fonts,
and writes the site.

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
  "devDependencies": { "sharp": "0.35.5", "subset-font": "2.9.0", "typescript": "5.9.3" }
}
```

sharp and subset-font are optional. The section "Processing" says what each
one adds. TypeScript does the type check of the templates. GGASS brings
esbuild with it.

A site has these folders. Only `pagedef/` is necessary.

| Folder | What it holds |
| --- | --- |
| `pagedef/` | One YAML file for each page. See "Pages". |
| `data/` | YAML files that the templates read. They make no pages. |
| `template/` | TSX templates that turn a pagedef into HTML. See "Templates". |
| `component/` | Custom elements: their HTML for templates, their styles and their browser code. See "Components". |
| `static/` | Images and other files that the build copies as they are |

The build script of the site, `build.ts`:

```ts
import { defineSite, run } from "ggass";

export const site = defineSite({
  name: "My site",
  nav: [{ href: "/guide/", label: "Guide" }, { href: "/search.html", label: "Search" }],
  css: { entry: "style.css" },
});

await run(site);
```

For the type check of the templates, the `tsconfig.json` of the site needs
`"jsx": "react-jsx"` and `"jsxImportSource": "ggass"`.

You need Node 24 or later. `run(site)` reads the command line:

```sh
node build.ts            # check the pages and the links, then write dist/
node build.ts --check    # check only, and write nothing
node build.ts --serve    # build, serve on http://127.0.0.1:4000, and rebuild after each save
node build.ts --watch    # build, and rebuild after each save, with no server
```

`--port` and `--host` change the address of the server, and `--quiet`
prints only the errors.

With `--serve` or `--watch`, a save in the site folder starts a new build.
That build renders again only the pages whose pagedef or template changed,
or whose template read a data file or a page that changed. It writes only
the files that changed. With `--serve`, the open page then reloads at once,
at the same scroll position.

If the build finds an error, it prints the error and sets the exit code
to 1. A site can also call `build(site, { check })` itself. It returns the
errors, the warnings, the files that it wrote, and the time of each step.

## Configuration

All settings except `name` are optional.

| Setting | Default | What it does |
| --- | --- | --- |
| `name` | | The site name, in the header and the page titles |
| `lang` | `"en"` | The language of the pages |
| `nav` | `[]` | The header links, as `{ href, label }` |
| `footer` | none | HTML at the bottom of each page |
| `root` | the current folder | The site folder. The paths below are relative to it. |
| `pagedef`, `data`, `template`, `component`, `static` | the same names | The folders of the site |
| `out` | `"dist"` | The output folder. A full build deletes it first. |
| `cache` | `node_modules/.cache/ggass` | Compiled templates, processed images and fonts, kept between builds |
| `fingerprint` | `true` | A content hash in each asset name |
| `toc` | `{ min: 3 }` | A table of contents on pages with at least `min` h2 and h3 headings. `false` turns it off. |
| `shortcuts` | `true` | Single-key shortcuts for keyboard readers |
| `share` | `true` | A share button in the bar at the bottom of phones and tablets |
| `offline` | `false` | A service worker for offline reading |
| `css` | | `entry`, `base`, `minify`, `sourcemap`, `targets` |
| `js` | | `minify`, `sourcemap`, `target`, and the JSX settings for browser code |
| `images` | | `responsive`, `widths`, `formats`, `quality`, `sizes`. `false` turns off image work. |
| `fonts` | `[]` | Font files, as `{ family, src, weight, style, subset, preload }` |
| `steps` | `[]` | More build steps. See "Build steps". |
| `serve` | `{ port: 4000, host: "127.0.0.1" }` | The address of the server of `run(site)` |

`src/config.ts` describes each setting.

## Pages

Each page is a YAML file in `pagedef/`, a pagedef. Its path gives its
address: `pagedef/guide/start.yaml` becomes `/guide/start.html`, and
`pagedef/guide/index.yaml` becomes `/guide/`.

```yaml
title: Getting started
kind: Guide
body: |
  <p>Install GGASS and build your first page.</p>
```

Each pagedef can have these keys:

| Key | What it does |
| --- | --- |
| `title` | Necessary. It goes in the `<title>` element and in the search results. |
| `kind` | The label in the search results. The default is "Page". |
| `template` | The template file in `template/`, without its extension. The default is `page`. |
| `pages` | Child pages. See "Child pages". |

The other keys are the fields of the template. Before it renders anything,
the build checks each pagedef against the fields of its template. A key that
the template does not list is an error. Each error names the YAML line, for
example `pagedef/guide/start.yaml:4: body: <b> is not closed before </p>`.

GGASS reads `.yaml` files only, and a `.yml` file is an error. A pagedef
with the address `/search.html` replaces the search page of GGASS.

### Defaults for a folder

A `_defaults.yaml` file gives its keys to each pagedef in its folder and in
the subfolders. The nearest `_defaults.yaml` wins key by key, and a key in
the pagedef wins over all of them. For example,
`pagedef/ops/_defaults.yaml` can hold `template: procedure` for each
procedure in that folder. Child pages do not get these keys.

### Child pages

One pagedef can make more pages. Each item in its `pages` list is a child
pagedef with an `id`. The address of a child is the address of its parent
plus its id:

- A child `part-2` of `pagedef/book/ch03.yaml` becomes `/book/ch03/part-2.html`.
- A child `part-2` of `pagedef/book/index.yaml` becomes `/book/part-2.html`.

A child can have children too. A child with no `template` key gets the
template that the template of its parent names, for example with
`pages: children("section")`. With no name there either, it gets `page`.

## Templates

A template is a TSX file in `template/`. Its default export is
`template({ fields, render })`. `fields` lists the keys of the pagedef, and
`render` returns the HTML of the page body:

```tsx
// template/procedure.tsx
import { html, list, number, optional, template } from "ggass";

export default template({
  fields: {
    summary: html(),
    steps: list({ t: html(), figs: optional(list(number())) }),
  },
  render: (page, site) => (
    <>
      <h1>{page.title}</h1>
      <p class="summary">{page.summary}</p>
      <ol>{page.steps.map((s) => <li>{s.t}</li>)}</ol>
    </>
  ),
});
```

| Field | The YAML value | The value in the template |
| --- | --- | --- |
| `text()` | Text. A number or true/false becomes text. | A string. TSX escapes it. |
| `html()` | HTML text. The build checks that each tag closes. | HTML that goes in as it is |
| `number()`, `boolean()` | A number, or true/false | A number or a boolean |
| `oneOf("a", "b")` | One of the texts in the list | A string |
| `list(field)` | A list. `list({ ... })` is a list of maps. | An array |
| `object({ ... })` | A map with these keys | An object |
| `optional(field)` | The key can be missing | The value, or `undefined` |
| `any()` | Any value. The build does not check it. | The value |
| `children("name")` | The `pages` key only | The child pages |

The type of `page` comes from the fields, so the type check catches a wrong
field name in the render function. `template({ fields, extra: true, render })`
allows keys that the fields do not list.

`site` gives the rest of the site to the template:

| Value | What it gives |
| --- | --- |
| `site.config` | The resolved configuration |
| `site.data.tools` | The value of `data/tools.yaml`. `data/forum/threads.yaml` is `site.data.forum.threads`. |
| `site.page("/guide/")` | A page by its address |
| `site.pages()` | All pages |
| `site.children(page)`, `site.parent(page)` | The child pages and the parent of a page |

The build freezes these values, so a template cannot change them. Each read
goes into a record, and a watch build uses the record to find the pages to
render again.

A template returns only the body of the page. The build then gives IDs to
the headings, makes the table of contents and the side notes, wraps the
popup links, and processes the images. Last, it puts the body inside the
frame template.

esbuild compiles the templates into the build cache, together with their
imports. Each top-level file in `template/` is a template, so put helper
modules in a subfolder.

### The templates of GGASS

GGASS has three templates. A site template with the same name replaces the
GGASS template.

| Template | What it makes |
| --- | --- |
| `frame` | The HTML document around each page: the header, the nav, the table of contents, the footer and the page tools. Its default export is `frame((input, site) => ...)`, and `input` holds `page`, `toc`, `body` and `head`. |
| `page` | A title and a `body: html()` field. It is the default template. |
| `search` | The search page |

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
- Images. Each `<img>` of a file in `static/` gets its `width` and `height`,
  `decoding="async"`, and `loading="lazy"` after the first image. See
  "Processing".

If a root-relative link (an `href`, `src` or `action` that starts with `/`)
has no target, the build stops. A target is a page, a file in `static/`, a
generated file or an asset.

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

esbuild is a dependency of GGASS. It compiles the templates. It also
bundles, minifies and hashes the CSS and the JavaScript, lowers new syntax
for `css.targets` and `js.target`, and writes source maps. Each relative
`@import` goes inline, and each file that `url()` names gets a hashed name.

Two optional packages add more. A site installs only the ones that it needs,
and the build finds them in the site folder.

| | Without the package | With the package |
| --- | --- | --- |
| Images | Reads the width and height of PNG, GIF, JPEG, WebP and SVG files | sharp also applies `data-image` operations, writes AVIF and WebP copies at several widths with `srcset` and `sizes`, and reads metadata |
| Fonts | Uses WOFF2 files whole | subset-font keeps only the characters that the site uses and converts other formats to WOFF2 |

`images.responsive` is `"auto"` by default, so the responsive copies start
when sharp is installed. A watch build keeps the font subsets of the first
build.

Each asset name holds a hash of its content, so a browser can keep the file
for a long time. Each `<link>` and `<script>` carries its Subresource
Integrity value (`integrity="sha384-..."`), and so does each module in the
import map. A browser refuses a file whose content does not match.

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

The build runs these steps in order: load, check, render, pages, images,
links, fonts, css, js, layout, offline and write. It prints the time of each
step. A site adds its own steps. A `page` hook runs after the images step,
and a `site` hook runs after the js step:

```ts
steps: [{
  name: "word count",
  page: (body, page, ctx) => body,            // runs for each page, returns the new body
  site: (ctx) => ctx.emit("stats.json", "{}"), // runs once, before the frame
}]
```

A step can add an error (`ctx.errors`), a warning (`ctx.warnings`), a file
(`ctx.emit`) or HTML for the head of each page (`ctx.head`).

## Components

A component is a group of files with the same name in `component/`. Each
file is optional:

| File | What it holds |
| --- | --- |
| `word-count.tsx` | A component for templates, made with `component({ tag, props, render })`. A template imports it and writes `<WordCount ...>`. The type check tests the props. |
| `word-count.css` | The styles of the component |
| `word-count.client.ts` | The browser code, which defines the custom element `<word-count>` |

The name must be a custom element name: lower case, with a hyphen. The
elements of GGASS are in the same form in the `component/` folder of GGASS.
A site component with the same name replaces the GGASS component, with all
of its files.

A page links the stylesheets and preloads the modules of the components in
its HTML, and no others. A small loader module looks for elements that are
not defined yet. It loads their modules and their stylesheets through the
import map of the page. So an element that arrives later, in a popup window,
still gets its code and its styles.

## Elements

Each element wraps plain HTML that works without JavaScript.
`test/fixture/pagedef/elements/index.yaml` shows the markup of each one.

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

The frame holds `<page-toc>`, `<key-shortcuts>` and `<share-button>`. The
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
npm run check      # type-check the library, the templates, the browser code and the service worker
npm test           # build the test site and small sites in temporary folders, and check them
npm run fixture    # build the test site into dist/
npm run serve      # build the test site, serve it on http://127.0.0.1:4000, and rebuild after each save
```

`test/fixture/` is the test site. It uses each element, a data file, child
pages, `_defaults.yaml`, site templates, side notes, image operations and a
site stylesheet. The font test needs a TrueType font from the system, and it
is skipped if it finds none.

## Limits

- GGASS cannot go on the npm registry as it is. Node does not strip types
  inside `node_modules`, so a registry package needs a step that writes
  JavaScript files first.
- The build finds tags with regular expressions. It does not parse a
  document tree.
- A watch build does not load `build.ts` or the code of GGASS again. After
  you change them, start the build again.
- A watch build keeps the font subsets of the first build. A new character
  can be missing from a font until the next full build.

## License

You can use GGASS under the Apache License 2.0 or under the GNU LGPL 2.1
or later, at your option (SPDX: `Apache-2.0 OR LGPL-2.1-or-later`). The
LGPL option is for software under the GNU GPL version 2, because the Free
Software Foundation considers Apache 2.0 incompatible with that version.
`LICENSE.txt` gives the details, and `LICENSES/` holds the full texts.

Each file names its copyright holder and license in an SPDX header. For
the files that cannot hold a comment, `REUSE.toml` gives this information.
The layout follows the [REUSE specification](https://reuse.software).
