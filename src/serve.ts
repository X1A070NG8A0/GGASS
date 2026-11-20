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

// A local web server for the output folder. It binds to 127.0.0.1, so only
// this computer can open the site.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { resolveConfig, type SiteConfig } from "./config.ts";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".map": "application/json", ".txt": "text/plain; charset=utf-8",
  ".jpg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp", ".avif": "image/avif",
  ".woff2": "font/woff2", ".woff": "font/woff",
};

export type ServeOptions = { port?: number; host?: string; quiet?: boolean };

export function serve(site: SiteConfig, options: ServeOptions = {}): Server {
  const out = resolveConfig(site).out;
  const port = options.port ?? Number(process.env.PORT ?? 4000);
  const host = options.host ?? "127.0.0.1";

  const resolve = (urlPath: string): string | undefined => {
    let rel: string;
    try {
      rel = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^([/\\])+/, "");
    } catch {
      return undefined;
    }
    let file = join(out, rel);
    if (file !== out && !file.startsWith(out + sep)) return undefined;
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    return existsSync(file) ? file : undefined;
  };

  return createServer((req, res) => {
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
    // A file that goes away during the read ends this response, not the server.
    createReadStream(file).on("error", () => res.destroy()).pipe(res);
  }).listen(port, host, () => {
    if (!options.quiet) console.log(`Site on http://${host}:${port}`);
  });
}
