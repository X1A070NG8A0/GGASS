// exif.ts - EXIF reader
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

export type Exif = {
  orientation?: number;
  make?: string;
  model?: string;
  software?: string;
  dateTime?: string;
  dateTimeOriginal?: string;
  exposureTime?: number;
  fNumber?: number;
  iso?: number;
  focalLength?: number;
  lensModel?: string;
  gps?: { latitude: number; longitude: number; altitude?: number };
};

const SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

type Value = string | number | number[] | Buffer;

export function readExif(input: Uint8Array): Exif | undefined {
  const buf = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const start = buf.subarray(0, 6).toString("latin1") === "Exif\0\0" ? 6 : 0;
  const order = buf.subarray(start, start + 2).toString("latin1");
  if (order !== "II" && order !== "MM") return undefined;
  const le = order === "II";
  const u16 = (at: number) => (le ? buf.readUInt16LE(start + at) : buf.readUInt16BE(start + at));
  const u32 = (at: number) => (le ? buf.readUInt32LE(start + at) : buf.readUInt32BE(start + at));
  const i32 = (at: number) => (le ? buf.readInt32LE(start + at) : buf.readInt32BE(start + at));
  if (u16(2) !== 42) return undefined;

  const ifd = (offset: number): Map<number, Value> => {
    const tags = new Map<number, Value>();
    if (!offset || start + offset + 2 > buf.length) return tags;
    const count = u16(offset);
    for (let i = 0; i < count; i++) {
      const at = offset + 2 + i * 12;
      if (start + at + 12 > buf.length) break;
      const tagId = u16(at), type = u16(at + 2), n = u32(at + 4);
      const size = (SIZES[type] ?? 0) * n;
      // Long lists, such as strip offsets, are skipped: no field here needs them.
      if (!size || (type !== 2 && type !== 7 && n > 16)) continue;
      const data = size <= 4 ? at + 8 : u32(at + 8);
      if (start + data + size > buf.length) continue;
      const read = (k: number): number => {
        const p = data + k * SIZES[type];
        switch (type) {
          case 3: return u16(p);
          case 4: return u32(p);
          case 9: return i32(p);
          case 5: return u32(p) / (u32(p + 4) || 1);
          case 10: return i32(p) / (i32(p + 4) || 1);
          default: return buf[start + p];
        }
      };
      if (type === 2) tags.set(tagId, buf.subarray(start + data, start + data + n).toString("utf8").replace(/\0+$/, "").trim());
      else if (type === 7) tags.set(tagId, buf.subarray(start + data, start + data + n));
      else tags.set(tagId, n === 1 ? read(0) : Array.from({ length: n }, (_, k) => read(k)));
    }
    return tags;
  };

  const ifd0 = ifd(u32(4));
  const sub = ifd(Number(ifd0.get(0x8769) ?? 0));
  const gpsTags = ifd(Number(ifd0.get(0x8825) ?? 0));
  const str = (v?: Value) => (typeof v === "string" && v ? v : undefined);
  const num = (v?: Value) => (typeof v === "number" ? v : Array.isArray(v) ? v[0] : undefined);

  const exif: Exif = {
    orientation: num(ifd0.get(0x0112)),
    make: str(ifd0.get(0x010f)),
    model: str(ifd0.get(0x0110)),
    software: str(ifd0.get(0x0131)),
    dateTime: str(ifd0.get(0x0132)),
    dateTimeOriginal: str(sub.get(0x9003)),
    exposureTime: num(sub.get(0x829a)),
    fNumber: num(sub.get(0x829d)),
    iso: num(sub.get(0x8827)),
    focalLength: num(sub.get(0x920a)),
    lensModel: str(sub.get(0xa434)),
  };
  const dms = (v?: Value) => (Array.isArray(v) && v.length === 3 ? v[0] + v[1] / 60 + v[2] / 3600 : undefined);
  const lat = dms(gpsTags.get(2)), lon = dms(gpsTags.get(4));
  if (lat !== undefined && lon !== undefined) {
    const alt = num(gpsTags.get(6));
    exif.gps = {
      latitude: gpsTags.get(1) === "S" ? -lat : lat,
      longitude: gpsTags.get(3) === "W" ? -lon : lon,
      // Altitude reference 1 means below sea level.
      ...(alt !== undefined ? { altitude: gpsTags.get(5) === 1 ? -alt : alt } : {}),
    };
  }
  for (const k of Object.keys(exif) as (keyof Exif)[]) if (exif[k] === undefined) delete exif[k];
  return exif;
}
