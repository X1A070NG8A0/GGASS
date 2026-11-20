// images.ts - image processing
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

import { readFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import type SharpType from "sharp";
import { attrs, esc, tag } from "../html.ts";
import type { BuildContext } from "../steps.ts";
import { readDimensions } from "./dimensions.ts";
import { readExif, type Exif } from "./exif.ts";
import { cached, shortHash } from "./hash.ts";
import { optional, required } from "./optional.ts";

type Sharp = typeof SharpType;

export type Gravity = "center" | "north" | "northeast" | "east" | "southeast" | "south" | "southwest" | "west" | "northwest";
export type Position = Gravity | "top" | "right" | "bottom" | "left" | "attention" | "entropy";
export type OutputFormat = "avif" | "webp" | "jpeg" | "png" | "gif" | "tiff";

export type ImageOverlay =
  | { image: string | Uint8Array; gravity?: Gravity; opacity?: number; width?: number }
  | { text: string; gravity?: Gravity; size?: number; color?: string; font?: string; opacity?: number };

export type ImageOps = {
  // Scale. A missing side keeps the aspect ratio. The image never grows.
  resize?: { width?: number; height?: number; fit?: "cover" | "contain" | "fill" | "inside" | "outside"; position?: Position };
  // Cut. `aspect` ("4:3") keeps the largest area with that shape. `width` and
  // `height` cut that size at `left` and `top`, or at `position`.
  crop?: { aspect?: string; width?: number; height?: number; left?: number; top?: number; position?: Position };
  // Degrees, clockwise. Photos turn upright by their EXIF orientation first.
  rotate?: number;
  flip?: boolean;
  flop?: boolean;
  // Colors: multipliers (1 is no change), except hue in degrees and
  // lightness as an addition.
  brightness?: number;
  saturation?: number;
  hue?: number;
  lightness?: number;
  contrast?: number;
  gamma?: number;
  grayscale?: boolean;
  sepia?: boolean;
  negate?: boolean;
  normalize?: boolean;
  blur?: number;
  sharpen?: boolean | number;
  tint?: string;
  threshold?: number;
  overlays?: ImageOverlay[];
  // The output format. The default is the input format.
  format?: OutputFormat;
  // 1 to 100.
  quality?: number;
  // The color behind transparent areas, for formats without transparency.
  background?: string;
};

export type ImageResult = { data: Buffer; width: number; height: number; format: string };

export type ImageMetadata = {
  format?: string;
  // The displayed size, after the EXIF orientation.
  width?: number;
  height?: number;
  space?: string;
  channels?: number;
  depth?: string;
  density?: number;
  hasAlpha?: boolean;
  orientation?: number;
  pages?: number;
  exif?: Exif;
};

const RASTER = /\.(jpe?g|png|webp|avif|gif|tiff?)$/i;

// The displayed size: EXIF orientations 5 to 8 turn the image on its side.
const shown = (m: { width?: number; height?: number; orientation?: number }) =>
  (m.orientation ?? 1) >= 5 ? { width: m.height, height: m.width } : { width: m.width, height: m.height };

const formatOf = (path: string): string => {
  const ext = (RASTER.exec(path)?.[1] ?? "png").toLowerCase();
  return ext === "jpg" ? "jpeg" : ext === "tif" ? "tiff" : ext;
};

const FITS = ["cover", "contain", "fill", "inside", "outside"];
const GRAVITIES = ["center", "north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
const POSITIONS = [...GRAVITIES, "top", "right", "bottom", "left", "attention", "entropy"];

const sharpFor = (root: string) => required<Sharp>("sharp", root, "Image processing");

// Parses the operations in a data-image attribute: key=value pairs and
// flags, separated by spaces. Values with spaces take quotes.
//
//   resize=800x600 fit=cover position=attention
//   crop=4:3 | crop=800x600 | crop=800x600+40+20
//   rotate=90 flip flop
//   brightness=1.1 saturation=0.8 hue=30 lightness=10 contrast=1.2 gamma=2.2
//   grayscale sepia negate normalize sharpen blur=2 tint=#704214 threshold=128
//   overlay=/logo.png overlay-gravity=southeast overlay-opacity=0.6 overlay-width=120
//   text="© 2026" text-gravity=southwest text-size=24 text-color=#fff
//   format=webp quality=75 background=#fff
export function parseImageSpec(spec: string): ImageOps {
  const ops: ImageOps = {};
  const overlay: Record<string, string> = {};
  const text: Record<string, string> = {};
  const number = (k: string, v: string) => {
    const n = Number(v);
    if (v === "" || !Number.isFinite(n)) throw new Error(`image option ${k}: "${v}" is not a number`);
    return n;
  };
  const oneOf = (k: string, v: string | undefined, allowed: string[]) => {
    if (v === undefined || !allowed.includes(v)) throw new Error(`image option ${k}: "${v ?? ""}" is not one of ${allowed.join(", ")}`);
    return v;
  };
  const size = (k: string, v: string) => {
    const m = v.match(/^(\d*)x(\d*)$/);
    if (!m || (!m[1] && !m[2])) throw new Error(`image option ${k}: "${v}" is not a size such as 800x600, 800x or x600`);
    return { width: m[1] ? Number(m[1]) : undefined, height: m[2] ? Number(m[2]) : undefined };
  };
  for (const m of spec.matchAll(/([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|(\S+)))?/g)) {
    const k = m[1], v = m[2] ?? m[3] ?? m[4];
    const flag = v === undefined;
    switch (k) {
      case "resize":
        ops.resize = { ...ops.resize, ...size(k, v ?? "") };
        break;
      case "fit":
        ops.resize = { ...ops.resize, fit: oneOf(k, v, FITS) as NonNullable<ImageOps["resize"]>["fit"] };
        break;
      case "position": {
        const position = oneOf(k, v, POSITIONS) as Position;
        ops.resize = { ...ops.resize, position };
        if (ops.crop) ops.crop.position = position;
        break;
      }
      case "crop": {
        const aspect = v?.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
        const box = v?.match(/^(\d+)x(\d+)(?:\+(\d+)\+(\d+))?$/);
        if (aspect) ops.crop = { aspect: v, position: ops.resize?.position };
        else if (box) ops.crop = { width: Number(box[1]), height: Number(box[2]), left: box[3] ? Number(box[3]) : undefined, top: box[4] ? Number(box[4]) : undefined, position: ops.resize?.position };
        else throw new Error(`image option crop: "${v}" is not an aspect such as 4:3 or a size such as 800x600+40+20`);
        break;
      }
      case "flip": case "flop": case "grayscale": case "sepia": case "negate": case "normalize":
        if (!flag && v !== "true" && v !== "false") throw new Error(`image option ${k} takes no value`);
        ops[k] = v !== "false";
        break;
      case "sharpen":
        ops.sharpen = flag ? true : number(k, v);
        break;
      case "rotate": case "brightness": case "saturation": case "hue": case "lightness": case "contrast": case "gamma": case "blur": case "threshold": case "quality":
        ops[k] = number(k, v ?? "");
        break;
      case "tint": case "background":
        if (flag) throw new Error(`image option ${k} needs a color`);
        ops[k] = v;
        break;
      case "format":
        if (!["avif", "webp", "jpeg", "jpg", "png", "gif", "tiff"].includes(v ?? "")) throw new Error(`image option format: "${v}" is not avif, webp, jpeg, png, gif or tiff`);
        ops.format = (v === "jpg" ? "jpeg" : v) as OutputFormat;
        break;
      case "overlay": case "overlay-gravity": case "overlay-opacity": case "overlay-width":
        overlay[k] = v ?? "";
        break;
      case "text": case "text-gravity": case "text-size": case "text-color": case "text-font": case "text-opacity":
        text[k] = v ?? "";
        break;
      default:
        throw new Error(`unknown image option "${k}"`);
    }
  }
  const overlays: ImageOverlay[] = [];
  if (overlay.overlay) {
    overlays.push({
      image: overlay.overlay,
      gravity: overlay["overlay-gravity"] ? (oneOf("overlay-gravity", overlay["overlay-gravity"], GRAVITIES) as Gravity) : undefined,
      opacity: overlay["overlay-opacity"] ? number("overlay-opacity", overlay["overlay-opacity"]) : undefined,
      width: overlay["overlay-width"] ? number("overlay-width", overlay["overlay-width"]) : undefined,
    });
  }
  if (text.text) {
    overlays.push({
      text: text.text,
      gravity: text["text-gravity"] ? (oneOf("text-gravity", text["text-gravity"], GRAVITIES) as Gravity) : undefined,
      size: text["text-size"] ? number("text-size", text["text-size"]) : undefined,
      color: text["text-color"] || undefined,
      font: text["text-font"] || undefined,
      opacity: text["text-opacity"] ? number("text-opacity", text["text-opacity"]) : undefined,
    });
  }
  if (overlays.length) ops.overlays = overlays;
  return ops;
}

// sharp names positions by sides: "north" is "top".
const SIDES: Record<string, string> = { north: "top", south: "bottom", east: "right", west: "left", northeast: "right top", northwest: "left top", southeast: "right bottom", southwest: "left bottom" };
const toPosition = (p: Position | undefined): string => (p ? (SIDES[p] ?? p) : "centre");

// The text is an SVG row as wide as the photo. The east or west part of the
// gravity sets the alignment.
function textImage(o: Extract<ImageOverlay, { text: string }>, width: number): Buffer {
  const size = o.size ?? Math.max(12, Math.round(width / 30));
  const pad = Math.round(size * 0.6);
  const g = o.gravity ?? "southeast";
  const anchor = g.includes("east") ? "end" : g.includes("west") ? "start" : "middle";
  const x = anchor === "end" ? width - pad : anchor === "start" ? pad : width / 2;
  const height = Math.round(size * 1.6);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<text x="${x}" y="${Math.round(size * 1.15)}" text-anchor="${anchor}" font-family="${esc(o.font ?? "sans-serif")}" font-size="${size}" ` +
      `fill="${esc(o.color ?? "#ffffff")}" fill-opacity="${o.opacity ?? 0.85}" stroke="#000000" stroke-opacity="${0.35 * (o.opacity ?? 1)}" stroke-width="${Math.max(1, size / 24)}" paint-order="stroke">${esc(o.text)}</text></svg>`,
  );
}

export async function processImage(input: string | Uint8Array, ops: ImageOps, options: { root?: string } = {}): Promise<ImageResult> {
  const root = options.root ?? process.cwd();
  const sharp = await sharpFor(root);
  const source = typeof input === "string" ? readFileSync(resolve(root, input)) : input;
  let img = sharp(source).autoOrient();
  const meta = await sharp(source).metadata();
  let { width = 0, height = 0 } = shown(meta);

  if (ops.crop) {
    const c = ops.crop;
    if (c.aspect) {
      const [a, b] = c.aspect.split(":").map(Number);
      const w = Math.min(width, Math.round((height * a) / b));
      const h = Math.min(height, Math.round((w * b) / a));
      img = img.resize({ width: w, height: h, fit: "cover", position: toPosition(c.position) });
      width = w;
      height = h;
    } else if (c.width && c.height) {
      const w = Math.min(c.width, width), h = Math.min(c.height, height);
      if (c.left !== undefined || c.top !== undefined) img = img.extract({ left: c.left ?? 0, top: c.top ?? 0, width: w, height: h });
      else img = img.resize({ width: w, height: h, fit: "cover", position: toPosition(c.position) });
      width = w;
      height = h;
    }
    // sharp allows one resize per pass, so the crop gets its own pass. Raw
    // pixels lose nothing.
    const cut = await img.raw().toBuffer({ resolveWithObject: true });
    img = sharp(cut.data, { raw: { width: cut.info.width, height: cut.info.height, channels: cut.info.channels } });
  }
  // A position alone (with no size) moves nothing, so it needs no pass.
  if (ops.resize && (ops.resize.width || ops.resize.height)) {
    const r = ops.resize;
    img = img.resize({ width: r.width, height: r.height, fit: r.fit ?? (r.width && r.height ? "cover" : "inside"), position: toPosition(r.position), withoutEnlargement: true });
  }
  if (ops.rotate) img = img.rotate(ops.rotate, { background: ops.background ?? "#0000" });
  if (ops.flip) img = img.flip();
  if (ops.flop) img = img.flop();
  if (ops.brightness !== undefined || ops.saturation !== undefined || ops.hue !== undefined || ops.lightness !== undefined) {
    img = img.modulate({ brightness: ops.brightness, saturation: ops.saturation, hue: ops.hue, lightness: ops.lightness });
  }
  if (ops.contrast !== undefined) img = img.linear(ops.contrast, 128 * (1 - ops.contrast));
  if (ops.gamma !== undefined) img = img.gamma(ops.gamma);
  if (ops.normalize) img = img.normalize();
  if (ops.sepia) img = img.recomb([[0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]]);
  if (ops.grayscale) img = img.grayscale();
  if (ops.tint) img = img.tint(ops.tint);
  if (ops.negate) img = img.negate({ alpha: false });
  if (ops.threshold !== undefined) img = img.threshold(ops.threshold);
  if (ops.blur) img = img.blur(Math.max(0.3, ops.blur));
  if (ops.sharpen) img = img.sharpen(ops.sharpen === true ? undefined : { sigma: ops.sharpen });

  if (ops.overlays?.length) {
    // Overlays need the final size, so the image so far goes through one pass.
    const base = await img.raw().toBuffer({ resolveWithObject: true });
    const layers = [];
    for (const o of ops.overlays) {
      if ("text" in o) {
        const g = o.gravity ?? "south";
        layers.push({ input: textImage(o, base.info.width), gravity: g.includes("north") ? "north" : g.includes("south") ? "south" : "centre" });
        continue;
      }
      let layer = sharp(typeof o.image === "string" ? readFileSync(resolve(root, o.image)) : o.image);
      layer = layer.resize({ width: Math.min(o.width ?? Math.round(base.info.width / 5), base.info.width), withoutEnlargement: false });
      if (o.opacity !== undefined && o.opacity < 1) {
        // Scale the alpha channel: keep the layer where a uniform alpha shows it.
        const alpha = Buffer.from([255, 255, 255, Math.round(255 * o.opacity)]);
        layer = sharp(await layer.ensureAlpha().composite([{ input: alpha, raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: "dest-in" }]).png().toBuffer());
      }
      layers.push({ input: await layer.png().toBuffer(), gravity: o.gravity ?? "southeast" });
    }
    img = sharp(base.data, { raw: { width: base.info.width, height: base.info.height, channels: base.info.channels } }).composite(layers);
  }

  const format = ops.format ?? ((meta.format === "heif" ? "avif" : meta.format) as OutputFormat | undefined) ?? "png";
  if (ops.background && !["png", "webp", "avif", "gif", "tiff"].includes(format)) img = img.flatten({ background: ops.background });
  const encoded = await img.toFormat(format, { quality: ops.quality, ...(format === "jpeg" ? { mozjpeg: true } : {}) }).toBuffer({ resolveWithObject: true });
  return { data: encoded.data, width: encoded.info.width, height: encoded.info.height, format: encoded.info.format };
}

export async function imageMetadata(input: string | Uint8Array, options: { root?: string } = {}): Promise<ImageMetadata> {
  const root = options.root ?? process.cwd();
  const sharp = await sharpFor(root);
  const source = typeof input === "string" ? readFileSync(resolve(root, input)) : input;
  const m = await sharp(source).metadata();
  return {
    format: m.format,
    ...shown(m),
    space: m.space,
    channels: m.channels,
    depth: m.depth,
    density: m.density,
    hasAlpha: m.hasAlpha,
    orientation: m.orientation,
    pages: m.pages,
    exif: m.exif ? readExif(m.exif) : undefined,
  };
}

const MIME: Record<string, string> = { avif: "image/avif", webp: "image/webp", jpeg: "image/jpeg", png: "image/png", gif: "image/gif" };

// A small pool, so that many large images do not all decode at once.
function pool(size: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(job: () => Promise<T>): Promise<T> => {
    if (active >= size) await new Promise<void>((go) => waiting.push(go));
    active++;
    try {
      return await job();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

export async function pageImages(ctx: BuildContext): Promise<void> {
  const { config, files, errors } = ctx;
  const settings = config.images;
  const known = new Set(files);
  const sharp = await optional<Sharp>("sharp", config.root);
  const responsive = settings && (settings.responsive === true || (settings.responsive === "auto" && !!sharp));
  if (settings && settings.responsive === true && !sharp) errors.push("images.responsive needs sharp. Install it in the site: npm install --save-dev sharp");
  const run = pool(4);
  const cacheDir = join(config.cache, "images");
  const version = sharp ? JSON.stringify(sharp.versions) : "";
  const emitted = new Set<string>();
  const emit = (name: string, data: Uint8Array) => {
    const rel = `assets/img/${name}`;
    if (!emitted.has(rel)) {
      ctx.emit(rel, data);
      emitted.add(rel);
    }
    return `/${rel}`;
  };

  for (const page of ctx.pages.values()) {
    const found = [...page.body.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    if (!found.length) continue;
    const one = async (img: string, isFirst: boolean): Promise<string> => {
      const a = attrs(img);
      const src = a.get("src") ?? "";
      const spec = a.get("data-image");
      a.delete("data-image");
      if (!a.has("decoding")) a.set("decoding", "async");
      if (!a.has("loading") && !isFirst) a.set("loading", "lazy");
      if (!src.startsWith("/") || src.startsWith("//") || !known.has(src.split(/[?#]/)[0])) {
        if (spec) errors.push(`${page.file}: data-image on "${src}", which is not a file in the content folder`);
        return tag("img", a);
      }
      const path = join(config.content, src.split(/[?#]/)[0].slice(1));
      const bytes = readFileSync(path);
      const raster = RASTER.test(src);
      let base: { data: Uint8Array; width: number; height: number; format: string } | undefined;
      let stem = basename(src, extname(src));
      let writeBase = () => {};
      if (spec) {
        if (!raster) {
          errors.push(`${page.file}: data-image on "${src}": only raster images (JPEG, PNG, WebP, AVIF, GIF, TIFF) take operations`);
          return tag("img", a);
        }
        if (!sharp) {
          errors.push(`${page.file}: data-image on "${src}" needs sharp. Install it in the site: npm install --save-dev sharp`);
          return tag("img", a);
        }
        let ops: ImageOps;
        try {
          ops = parseImageSpec(spec);
        } catch (e) {
          errors.push(`${page.file}: data-image on "${src}": ${(e as Error).message}`);
          return tag("img", a);
        }
        // An overlay path that starts with "/" is a file in the content folder.
        let overlayBytes = "";
        for (const o of ops.overlays ?? []) {
          if (!("image" in o) || typeof o.image !== "string") continue;
          if (!known.has(o.image)) {
            errors.push(`${page.file}: data-image on "${src}": overlay "${o.image}" is not a file in the content folder`);
            return tag("img", a);
          }
          o.image = readFileSync(join(config.content, o.image.slice(1)));
          overlayBytes += shortHash(o.image);
        }
        const key = shortHash(bytes, JSON.stringify({ ...ops, overlays: ops.overlays?.map((o) => ("image" in o ? { ...o, image: "" } : o)) }), overlayBytes, version);
        const inputFormat = formatOf(src);
        const ext = (ops.format ?? inputFormat).replace("jpeg", "jpg");
        const data = await run(() => cached(cacheDir, `${key}.${ext}`, () => processImage(bytes, ops, { root: config.root }).then((r) => r.data)));
        const info = await sharp(data).metadata();
        base = { data, width: info.width ?? 0, height: info.height ?? 0, format: info.format ?? inputFormat };
        // The processed image itself is written only if no responsive
        // copies replace it.
        stem = `${basename(src, extname(src))}-${key}`;
        writeBase = () => void a.set("src", emit(`${stem}.${ext}`, data));
      }
      const size = base ?? (raster && sharp ? shown(await sharp(bytes).metadata()) : readDimensions(bytes));
      if (!size?.width || !size.height) {
        if (!a.has("width") || !a.has("height")) ctx.warnings.push(`${page.file}: cannot read the size of "${src}". Give the img a width and a height.`);
        return tag("img", a);
      }
      if (!a.has("width") && !a.has("height")) {
        a.set("width", String(size.width));
        a.set("height", String(size.height));
      } else if (!a.has("height")) a.set("height", String(Math.round((Number(a.get("width")) * size.height) / size.width)));
      else if (!a.has("width")) a.set("width", String(Math.round((Number(a.get("height")) * size.width) / size.height)));

      if (!responsive || !settings || !raster || /\.gif$/i.test(src) || !sharp) {
        writeBase();
        return tag("img", a);
      }
      const source = base?.data ?? bytes;
      const fullWidth = size.width;
      const max = Math.max(...settings.widths);
      const widths = [...new Set([...settings.widths.filter((w) => w < fullWidth), Math.min(fullWidth, max)])].sort((x, y) => x - y);
      // The <img> keeps a JPEG or PNG copy for browsers without AVIF or WebP.
      const fallback = (base?.format ?? formatOf(src)) === "png" ? "png" : "jpeg";
      const extra = [...new Set(settings.formats)].filter((f) => f !== fallback);
      const copies = (format: string) =>
        Promise.all(
          widths.map(async (w) => {
            const key = shortHash(source, String(w), format, String(settings.quality ?? ""), version);
            const ext = format === "jpeg" ? "jpg" : format;
            const data = await run(() =>
              cached(cacheDir, `${key}.${ext}`, () => processImage(source, { resize: { width: w }, format: format as OutputFormat, quality: settings.quality }, { root: config.root }).then((r) => r.data)),
            );
            return emit(`${stem}-${w}-${key}.${ext}`, data);
          }),
        );
      const srcset = (urls: string[]) => urls.map((u, i) => `${u} ${widths[i]}w`).join(", ");
      const [main, ...others] = await Promise.all([fallback, ...extra].map(copies));
      a.set("src", main[main.length - 1]);
      a.set("srcset", srcset(main));
      const sizes = a.get("sizes") ?? settings.sizes;
      a.set("sizes", sizes);
      const sources = others.map((urls, i) => `<source type="${MIME[extra[i]]}" srcset="${esc(srcset(urls))}" sizes="${esc(sizes)}">`).join("");
      return `<picture>${sources}${tag("img", a)}</picture>`;
    };
    // One failed image is an error for that image, not a crash of the build.
    const results = await Promise.all(
      found.map((img, i) =>
        one(img, i === 0).catch((e: unknown) => {
          errors.push(`${page.file}: image "${attrs(img).get("src") ?? ""}": ${e instanceof Error ? e.message : String(e)}`);
          return img;
        }),
      ),
    );
    let i = 0;
    page.body = page.body.replace(/<img\b[^>]*>/g, () => results[i++]);
  }
}
