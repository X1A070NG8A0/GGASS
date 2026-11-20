// dimensions.ts - image sizes from file headers
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

// Gives the displayed size: a JPEG that EXIF turns on its side has its width
// and height swapped.
import { readExif } from "./exif.ts";

export type Size = { width: number; height: number };

function jpeg(b: Buffer): Size | undefined {
  let orientation = 1;
  let at = 2;
  while (at + 9 < b.length) {
    if (b[at] !== 0xff) return undefined;
    const marker = b[at + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      at += 2;
      continue;
    }
    const len = b.readUInt16BE(at + 2);
    if (marker === 0xe1 && b.subarray(at + 4, at + 10).toString("latin1") === "Exif\0\0") {
      orientation = readExif(b.subarray(at + 4, at + 2 + len))?.orientation ?? 1;
    }
    // SOF0 to SOF15, without DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = b.readUInt16BE(at + 5), width = b.readUInt16BE(at + 7);
      return orientation >= 5 ? { width: height, height: width } : { width, height };
    }
    at += 2 + len;
  }
  return undefined;
}

function webp(b: Buffer): Size | undefined {
  const chunk = b.subarray(12, 16).toString("latin1");
  if (chunk === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8L") {
    const b1 = b[22], b2 = b[23], b3 = b[24];
    return { width: 1 + (((b1 & 0x3f) << 8) | b[21]), height: 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
  }
  if (chunk === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  return undefined;
}

function svg(text: string): Size | undefined {
  const tag = text.match(/<svg\b[^>]*>/)?.[0];
  if (!tag) return undefined;
  const len = (name: string) => {
    const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)(px)?\\s*["']`));
    return m ? Number(m[1]) : undefined;
  };
  const width = len("width"), height = len("height");
  if (width && height) return { width: Math.round(width), height: Math.round(height) };
  const box = tag.match(/\sviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/);
  if (!box) return undefined;
  const w = Number(box[1]), h = Number(box[2]);
  if (width) return { width: Math.round(width), height: Math.round((width * h) / w) };
  if (height) return { width: Math.round((height * w) / h), height: Math.round(height) };
  return { width: Math.round(w), height: Math.round(h) };
}

export function readDimensions(input: Uint8Array): Size | undefined {
  const b = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (b.length < 30) return undefined;
  if (b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.subarray(0, 4).toString("latin1") === "GIF8") return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  if (b[0] === 0xff && b[1] === 0xd8) return jpeg(b);
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return webp(b);
  const head = b.subarray(0, 4096).toString("utf8");
  if (/<svg\b/.test(head)) return svg(b.toString("utf8"));
  return undefined;
}
