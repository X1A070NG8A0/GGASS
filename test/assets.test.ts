// assets.test.ts - tests of the asset helpers
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

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { imageMetadata, minifyCss, parseImageSpec, processImage, readDimensions, readExif } from "ggass";
import sharp from "sharp";

const PHOTO = join(import.meta.dirname, "fixture", "content", "photos", "sample.jpg");

describe("minifyCss", () => {
  test("removes comments and white space where it has no meaning", () => {
    assert.equal(minifyCss("a  >  b ,\n c {\n  color: red ;\n  margin: 0 auto;\n}\n"), "a>b,c{color:red;margin:0 auto}");
    // A space before a colon can be a descendant selector, so it stays.
    assert.equal(minifyCss("a { color : red }"), "a{color :red}");
  });
  test("keeps strings, calc() and descendant pseudo-classes", () => {
    const css = `a::before { content: "a , b ; c" } .x { width: calc(100% - 2rem) } .a :is(.b) { color: blue }`;
    assert.equal(minifyCss(css), `a::before{content:"a , b ; c"}.x{width:calc(100% - 2rem)}.a :is(.b){color:blue}`);
  });
  test("keeps /*! comments", () => {
    assert.equal(minifyCss("/*! license */ /* gone */ a { b: c }"), "/*! license */a{b:c}");
  });
});

describe("parseImageSpec", () => {
  test("reads operations, flags and quoted values", () => {
    assert.deepEqual(parseImageSpec("crop=4:3 position=north grayscale rotate=90 text='Hello there' text-gravity=southwest format=jpg quality=70"), {
      crop: { aspect: "4:3", position: "north" },
      resize: { position: "north" },
      grayscale: true,
      rotate: 90,
      format: "jpeg",
      quality: 70,
      overlays: [{ text: "Hello there", gravity: "southwest", size: undefined, color: undefined, font: undefined, opacity: undefined }],
    });
  });
  test("reads sizes", () => {
    assert.deepEqual(parseImageSpec("resize=800x fit=inside").resize, { width: 800, height: undefined, fit: "inside" });
    assert.deepEqual(parseImageSpec("crop=200x100+10+20").crop, { width: 200, height: 100, left: 10, top: 20, position: undefined });
  });
  test("refuses unknown options and bad values", () => {
    assert.throws(() => parseImageSpec("sparkle"), /unknown image option "sparkle"/);
    assert.throws(() => parseImageSpec("blur=lots"), /not a number/);
    assert.throws(() => parseImageSpec("resize=big"), /not a size/);
  });
});

describe("readDimensions", () => {
  test("reads PNG, GIF, WebP and JPEG headers", async () => {
    const base = sharp({ create: { width: 37, height: 21, channels: 3, background: "#808080" } });
    for (const format of ["png", "gif", "webp", "jpeg"] as const) {
      const data = await base.clone().toFormat(format).toBuffer();
      assert.deepEqual(readDimensions(data), { width: 37, height: 21 }, format);
    }
  });
  test("swaps the sides of a JPEG that EXIF turns on its side", async () => {
    const data = await sharp({ create: { width: 40, height: 10, channels: 3, background: "#000" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    assert.deepEqual(readDimensions(data), { width: 10, height: 40 });
  });
  test("reads SVG width, height and viewBox", () => {
    assert.deepEqual(readDimensions(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">                                  </svg>')), { width: 400, height: 300 });
    assert.deepEqual(readDimensions(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" viewBox="0 0 400 300">                     </svg>')), { width: 200, height: 150 });
  });
});

describe("EXIF and metadata", () => {
  test("reads the camera, exposure and GPS fields", async () => {
    const meta = await imageMetadata(PHOTO);
    assert.equal(meta.width, 1600);
    assert.equal(meta.height, 1000);
    assert.equal(meta.format, "jpeg");
    assert.deepEqual(meta.exif, {
      orientation: 1,
      make: "GGASS",
      model: "Test pattern",
      software: "sharp",
      dateTimeOriginal: "2026:11:19 09:30:00",
      exposureTime: 0.004,
      fNumber: 8,
      iso: 100,
      gps: { latitude: 45.5, longitude: -(73 + 34 / 60 + 12 / 3600) },
    });
  });
  test("returns undefined for data that is not EXIF", () => {
    assert.equal(readExif(Buffer.from("not exif at all")), undefined);
  });
});

describe("processImage", () => {
  test("crops, rotates, filters and converts", async () => {
    const out = await processImage(PHOTO, { crop: { aspect: "1:1" }, rotate: 90, grayscale: true, format: "webp", quality: 60 });
    assert.equal(out.format, "webp");
    assert.equal(out.width, 1000);
    assert.equal(out.height, 1000);
    const stats = await sharp(out.data).stats();
    assert.ok(stats.isOpaque);
    // Gray: the three channels have the same mean.
    assert.ok(Math.abs(stats.channels[0].mean - stats.channels[2].mean) < 1);
  });
  test("resizes without growing the image", async () => {
    const small = await processImage(PHOTO, { resize: { width: 320 } });
    assert.deepEqual([small.width, small.height], [320, 200]);
    const big = await processImage(PHOTO, { resize: { width: 4000 } });
    assert.equal(big.width, 1600);
  });
  test("overlays text and an image", async () => {
    const logo = await sharp({ create: { width: 50, height: 50, channels: 4, background: "#ff0000" } }).png().toBuffer();
    const plain = await processImage(PHOTO, { resize: { width: 400 }, format: "png" });
    const marked = await processImage(PHOTO, { resize: { width: 400 }, overlays: [{ text: "Mark" }, { image: logo, gravity: "northwest", width: 40, opacity: 0.5 }], format: "png" });
    assert.notDeepEqual(marked.data, plain.data);
    // The half-transparent red square is at the top left.
    const { data } = await sharp(marked.data).extract({ left: 10, top: 10, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    assert.ok(data[0] > data[1] + 60, `red over the sky: ${[...data].join(", ")}`);
  });
});

// The repository holds no font files, so the test uses a system font.
const FONT = ["C:/Windows/Fonts/arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf"].find((f) => existsSync(f));

describe("fonts", { skip: FONT ? false : "no system font found" }, () => {
  test("subsets a font to the characters of the site and writes @font-face", async () => {
    const { build } = await import("ggass");
    const { site } = await import("./fixture/build.ts");
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const out = mkdtempSync(join(tmpdir(), "ggass-font-"));
    try {
      const result = await build({ ...site, out, images: false, offline: false, fonts: [{ family: "Test Sans", src: FONT!, weight: 400, preload: true }] }, { quiet: true });
      assert.deepEqual(result.errors, []);
      const woff2 = result.outputs.find((o) => /^assets\/fonts\/.+-[0-9a-f]{10}\.woff2$/.test(o))!;
      assert.ok(woff2, "a fingerprinted WOFF2 file");
      const size = readFileSync(join(out, woff2)).length;
      assert.ok(size < readFileSync(FONT!).length / 4, `the subset (${size} bytes) is much smaller than the font`);
      const css = readFileSync(join(out, result.outputs.find((o) => o.endsWith(".css"))!), "utf8");
      assert.ok(css.includes(`@font-face{font-family:Test Sans;src:url(/${woff2}) format("woff2");font-weight:400`), "the @font-face rule, minified by esbuild");
      assert.ok(readFileSync(join(out, "index.html"), "utf8").includes(`<link rel="preload" href="/${woff2}" as="font" type="font/woff2" crossorigin>`));
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
