// schema.ts - the fields that a template reads from a pagedef
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

import { Html } from "./jsx-runtime.ts";

export type Path = (string | number)[];
export type Issue = { path: Path; message: string };

export type Field<T = unknown, Optional extends boolean = boolean> = {
  readonly kind: string;
  readonly optional: Optional;
  parse(value: unknown, path: Path, issues: Issue[]): T;
};

export type Fields = { readonly [key: string]: Field };

type Prettify<T> = { [K in keyof T]: T[K] } & {};
type OptionalKeys<F extends Fields> = { [K in keyof F]: F[K] extends Field<unknown, true> ? K : never }[keyof F];

export type Infer<F> = F extends Field<infer T> ? T : F extends Fields ? InferFields<F> : never;
export type InferFields<F extends Fields> = Prettify<
  { -readonly [K in Exclude<keyof F, OptionalKeys<F>>]: Infer<F[K]> } & { -readonly [K in OptionalKeys<F>]?: Infer<F[K]> }
>;

const MISSING = Symbol("missing");

export const showPath = (path: Path): string =>
  path.map((p, i) => (typeof p === "number" ? `[${p}]` : i ? `.${p}` : p)).join("") || "the page";

function field<T>(kind: string, parse: (value: unknown, path: Path, issues: Issue[]) => T | typeof MISSING): Field<T, false> {
  return {
    kind,
    optional: false,
    parse(value, path, issues) {
      if (value === undefined || value === null) {
        issues.push({ path, message: `${showPath(path)}: missing. It must be ${kind}.` });
        return undefined as T;
      }
      const out = parse(value, path, issues);
      if (out === MISSING) {
        issues.push({ path, message: `${showPath(path)}: must be ${kind}` });
        return undefined as T;
      }
      return out;
    },
  };
}

// YAML reads `title: 2026` as a number, so a number or true/false is text.
export const text = (): Field<string, false> =>
  field("text", (v) => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : MISSING));

export const html = (): Field<Html, false> =>
  field("HTML text", (v, path, issues) => {
    if (typeof v !== "string" && typeof v !== "number") return MISSING;
    const s = String(v);
    const problem = unclosed(s);
    if (problem) issues.push({ path, message: `${showPath(path)}: ${problem}` });
    return new Html(s);
  });

export const number = (): Field<number, false> => field("a number", (v) => (typeof v === "number" && Number.isFinite(v) ? v : MISSING));

export const boolean = (): Field<boolean, false> => field("true or false", (v) => (typeof v === "boolean" ? v : MISSING));

export const oneOf = <const V extends string>(...values: V[]): Field<V, false> =>
  field(`one of ${values.map((v) => `"${v}"`).join(", ")}`, (v) => (typeof v === "string" && (values as string[]).includes(v) ? (v as V) : MISSING));

// Any YAML value, not checked.
export const any = (): Field<unknown, false> => field("any value", (v) => v);

export const optional = <T>(inner: Field<T>): Field<T | undefined, true> => ({
  kind: inner.kind,
  optional: true,
  parse: (value, path, issues) => (value === undefined || value === null ? undefined : inner.parse(value, path, issues)),
});

const asField = (f: Field | Fields): Field => (typeof (f as Field).parse === "function" ? (f as Field) : object(f as Fields));

export function list<F extends Field | Fields>(item: F): Field<Infer<F>[], false> {
  const inner = asField(item);
  return field(`a list of ${inner.kind}`, (v, path, issues) =>
    Array.isArray(v) ? (v.map((x, i) => inner.parse(x, [...path, i], issues)) as Infer<F>[]) : MISSING,
  );
}

export type ObjectOptions = { extra?: boolean };

// Checks a map against its fields. A key that the fields do not list is an
// error, unless `extra` allows it.
export function parseFields(fields: Fields, map: Record<string, unknown>, path: Path, issues: Issue[], options: ObjectOptions = {}): Record<string, unknown> {
  const out: Record<string, unknown> = options.extra ? { ...map } : {};
  for (const [key, f] of Object.entries(fields)) {
    const value = f.parse(map[key], [...path, key], issues);
    if (value !== undefined) out[key] = value;
  }
  if (!options.extra) {
    const known = Object.keys(fields);
    for (const key of Object.keys(map))
      if (!(key in fields)) issues.push({ path: [...path, key], message: `${showPath([...path, key])}: unknown key. The keys here are: ${known.join(", ")}.` });
  }
  return out;
}

export function object<F extends Fields>(fields: F, options: ObjectOptions = {}): Field<InferFields<F>, false> {
  return field("a map", (v, path, issues) =>
    v && typeof v === "object" && !Array.isArray(v) ? (parseFields(fields, v as Record<string, unknown>, path, issues, options) as InferFields<F>) : MISSING,
  );
}

// The `pages` key of a pagedef: its child pages. `template` is the default
// template of each child. The build replaces the list with the child pages.
export type ChildrenField = Field<ChildPage[], true> & { readonly children: true; readonly template?: string };
export type ChildPage = { url: string; id?: string; title: string; kind: string; template: string; [key: string]: unknown };
export const children = (template?: string): ChildrenField => ({
  kind: "a list of child pages",
  optional: true,
  children: true,
  template,
  parse: (value) => value as ChildPage[],
});

export const isChildren = (f: Field | undefined): f is ChildrenField => !!f && (f as ChildrenField).children === true;

// These elements can leave out their end tag in HTML.
const OPTIONAL_END = new Set(["p", "li", "dt", "dd", "tr", "td", "th", "thead", "tbody", "tfoot", "option", "optgroup", "rt", "rp", "colgroup", "caption"]);
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

// Returns a message if an element is not closed or an end tag closes nothing.
export function unclosed(html: string): string | undefined {
  const stack: string[] = [];
  const source = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  for (const m of source.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g)) {
    const name = m[2].toLowerCase();
    if (!m[1]) {
      if (!VOID.has(name) && !m[3]) stack.push(name);
      continue;
    }
    if (VOID.has(name)) continue;
    if (!stack.includes(name)) return `</${name}> has no open <${name}>`;
    while (stack.at(-1) !== name) {
      const open = stack.pop()!;
      if (!OPTIONAL_END.has(open)) return `<${open}> is not closed before </${name}>`;
    }
    stack.pop();
  }
  const left = stack.filter((n) => !OPTIONAL_END.has(n));
  return left.length ? `<${left.at(-1)}> is not closed` : undefined;
}
