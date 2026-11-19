// serve.ts - local web server for the built site
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

// Local static server for dist/. It binds to 127.0.0.1, so only this
// computer can open the site.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const DIST = join(import.meta.dirname, "..", "dist");
const PORT = Number(process.env.PORT ?? 4000);
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".webp": "image/webp", ".txt": "text/plain; charset=utf-8",
};

function resolve(urlPath: string): string | undefined {
  const rel = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^([/\\])+/, "");
  let file = join(DIST, rel);
  if (!file.startsWith(DIST)) return undefined;
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  return existsSync(file) ? file : undefined;
}

createServer((req, res) => {
  const file = resolve(req.url ?? "/");
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    return;
  }
  // Caching: the browser keeps each file and asks "changed since?" on each
  // use (no-cache). If the file did not change, the answer is a short 304.
  const modified = statSync(file).mtime;
  modified.setMilliseconds(0); // HTTP dates have whole seconds
  const headers = {
    "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    "last-modified": modified.toUTCString(),
    "cache-control": "no-cache",
  };
  const since = Date.parse(req.headers["if-modified-since"] ?? "");
  if (since >= modified.getTime()) {
    res.writeHead(304, headers).end();
    return;
  }
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
}).listen(PORT, "127.0.0.1", () => console.log(`Site on http://127.0.0.1:${PORT}`));
