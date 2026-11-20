// transform.ts - page transforms: headings, side notes, popup links
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

import type { Page } from "./content.ts";
import { attrs, slug, tag, target, textOf } from "./html.ts";

export function headings(page: Page): void {
  const ids = new Set([...page.body.matchAll(/\sid=(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)].map((m) => m[1] ?? m[2] ?? m[3]));
  page.toc = [];
  page.body = page.body.replace(/<h([23])\b([^>]*)>([\s\S]*?)<\/h\1>/g, (all, level: string, rest: string, inner: string) => {
    const a = attrs(`<h${level}${rest}>`);
    const text = textOf(inner);
    let id = a.get("id");
    if (!id) {
      const stem = slug(text);
      id = stem;
      for (let n = 2; ids.has(id); n++) id = `${stem}-${n}`;
      ids.add(id);
      a.set("id", id);
    }
    if (!a.has("data-notoc")) page.toc.push({ level: Number(level), id, text });
    return `${tag(`h${level}`, a)}${inner}</h${level}>`;
  });
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
// Elements whose end gets the side notes that they hold.
const BLOCKS = new Set(["p", "li", "dd", "dt", "td", "th", "figcaption", "caption", "blockquote", "summary", "h1", "h2", "h3", "h4", "h5", "h6"]);

// Each note moves to the end of its paragraph, so that on a narrow screen it
// follows the sentence instead of splitting it.
export function sideNotes(page: Page, errors: string[]): void {
  if (!page.body.includes("<side-note")) return;
  const notes: string[] = [];
  const stack: { name: string; pending: string[] }[] = [];
  let out = "";
  let at = 0;
  for (const m of page.body.matchAll(/<side-note\b[^>]*>([\s\S]*?)<\/side-note>|<(\/?)([a-zA-Z][\w-]*)\b[^>]*>/g)) {
    out += page.body.slice(at, m.index);
    at = m.index + m[0].length;
    if (m[1] !== undefined) {
      const n = notes.length + 1;
      const content = m[1].trim();
      notes.push(content);
      const ref = `<a class="note-ref" id="note-ref-${n}" href="#note-${n}" role="doc-noteref" aria-label="Note ${n}" style="anchor-name: --note-${n}">${n}</a>`;
      const note = `<side-note id="note-${n}" role="note" aria-label="Note ${n}" style="position-anchor: --note-${n}"><a class="note-num" href="#note-ref-${n}" aria-label="Back to the text of note ${n}">${n}</a> ${content}</side-note>`;
      const block = stack.findLast((b) => BLOCKS.has(b.name));
      if (!block) {
        errors.push(`${page.file}: side note ${n} is not in a paragraph, list item or table cell`);
        out += ref + note;
        continue;
      }
      block.pending.push(note);
      out += ref;
      continue;
    }
    const name = m[3].toLowerCase();
    if (m[2] !== "/") {
      if (!VOID.has(name) && !m[0].endsWith("/>")) stack.push({ name, pending: [] });
      out += m[0];
      continue;
    }
    const open = stack.findLastIndex((b) => b.name === name);
    out += open >= 0 ? stack.splice(open).flatMap((b) => b.pending).join("") + m[0] : m[0];
  }
  out += page.body.slice(at) + stack.flatMap((b) => b.pending).join("");
  const list = notes.map((n) => `<li>${n}</li>`).join("\n");
  page.body = `${out}\n<section class="endnotes" aria-labelledby="endnotes-title">\n<h2 id="endnotes-title" data-notoc>Notes</h2>\n<ol>\n${list}\n</ol>\n</section>`;
}

// Adds each popup target to `targets`: those pages get a /frag/ copy.
export function popups(page: Page, pages: Map<string, Page>, errors: string[], targets: Set<string>): void {
  page.body = page.body.replace(/<a\b([^>]*)\sdata-pop(?=[\s>])([^>]*)>([\s\S]*?)<\/a>/g, (all, before: string, after: string, label: string) => {
    const href = `${before}${after}`.match(/\shref="([^"]*)"/)?.[1] ?? "";
    const hit = href.startsWith("/") ? pages.get(target(href)) : undefined;
    if (!hit) {
      errors.push(`${page.file}: data-pop on "${href}", which is not a page`);
      return all;
    }
    targets.add(hit.url);
    return `<pop-link><a${before} data-pop="/frag${hit.url}"${after}>${label}</a></pop-link>`;
  });
}

export const customTags = (html: string): Set<string> => new Set([...html.matchAll(/<([a-z][a-z0-9]*-[a-z0-9-]*)[\s/>]/g)].map((m) => m[1]));
