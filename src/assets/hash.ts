// hash.ts - content hashes, integrity values and the cache
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

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Returns "sha384-" and the base64 hash. Browsers refuse a file that differs.
export const integrity = (data: string | Uint8Array): string => `sha384-${createHash("sha384").update(data).digest("base64")}`;

export const shortHash = (...parts: (string | Uint8Array)[]): string => {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest("hex").slice(0, 10);
};

export const fingerprinted = (path: string, data: string | Uint8Array, on: boolean): string =>
  on ? path.replace(/(\.[^./]+)$/, `-${shortHash(data)}$1`) : path;

// Concurrent calls for one file share a job. Finished jobs leave the map, so it
// holds no data and no failures.
const running = new Map<string, Promise<Buffer>>();
export function cached(dir: string, key: string, make: () => Promise<Uint8Array>): Promise<Buffer> {
  const path = join(dir, key);
  let job = running.get(path);
  if (!job) {
    job = (async () => {
      try {
        return readFileSync(path);
      } catch {
        const data = Buffer.from(await make());
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, data);
        return data;
      }
    })();
    running.set(path, job);
    const done = () => running.delete(path);
    job.then(done, done);
  }
  return job;
}
