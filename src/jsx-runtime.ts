// jsx-runtime.ts - renders TSX templates to HTML strings
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

// HTML that is ready to insert. The runtime escapes plain strings and never
// escapes an Html value, so a value goes through escaping once at most.
export class Html {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
}

export const raw = (html: string): Html => new Html(html);

export type Child = Html | string | number | bigint | boolean | null | undefined | readonly Child[];

type Props = { [name: string]: unknown; children?: Child };
type Render = (props: Props) => unknown;

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escape = (s: string): string => s.replace(/[&<>"']/g, (c) => ENTITIES[c]);

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
// The text of these elements is never escaped.
const RAW_TEXT = new Set(["script", "style"]);
const ATTRIBUTE_NAMES: Record<string, string> = { className: "class", htmlFor: "for" };

function children(c: Child, rawText = false): string {
  if (c === null || c === undefined || typeof c === "boolean") return "";
  if (c instanceof Html) return c.value;
  if (Array.isArray(c)) return (c as readonly Child[]).map((x) => children(x, rawText)).join("");
  // "</script" in a value would end the element early. "<\/" means the same in
  // JavaScript strings and CSS.
  return rawText ? String(c).replace(/<\/(script|style)/gi, "<\\/$1") : escape(String(c));
}

function attributes(props: Props): string {
  let out = "";
  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || value === null || value === undefined || value === false) continue;
    const name = ATTRIBUTE_NAMES[key] ?? key;
    out += value === true ? ` ${name}` : ` ${name}="${escape(String(value))}"`;
  }
  return out;
}

export function jsx(type: string | Render, props: Props): Html {
  if (typeof type === "function") {
    const result = type(props);
    return result instanceof Html ? result : new Html(children(result as Child));
  }
  const open = `<${type}${attributes(props)}>`;
  if (VOID.has(type)) return new Html(open);
  return new Html(`${open}${children(props.children, RAW_TEXT.has(type))}</${type}>`);
}

export const jsxs = jsx;
export const jsxDEV = jsx;

export function Fragment(props: { children?: Child }): Html {
  return new Html(children(props.children));
}

export declare namespace JSX {
  type Element = Html;
  interface ElementChildrenAttribute {
    children: unknown;
  }
  interface IntrinsicElements {
    [name: string]: { [attribute: string]: unknown; children?: Child };
  }
}
