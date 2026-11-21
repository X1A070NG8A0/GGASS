// run.ts - run(site): the command line of a site build script
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

import { watch } from "node:fs";
import { join, relative, sep } from "node:path";
import { parseArgs } from "node:util";
import { Builder } from "./build.ts";
import { GGASS_COMPONENTS } from "./components.ts";
import type { SiteConfig } from "./config.ts";
import { RELOAD_SCRIPT, serve, type SiteServer } from "./serve.ts";
import { formatMs } from "./steps.ts";

const USAGE = `Usage: node build.ts [--check] [--serve] [--watch] [--port N] [--host H] [--quiet]

  (no option)  build the site into the output folder
  --check      check the pages and the links, and write nothing
  --serve      build, serve the site, and rebuild and reload after each save
  --watch      build, and rebuild after each save, with no server
  --port N     the port of the server (the default is serve.port, or 4000)
  --host H     the host of the server (the default is 127.0.0.1)
  --quiet      print only the errors`;

const GGASS_FOLDERS = [GGASS_COMPONENTS, join(import.meta.dirname, "..", "template"), join(import.meta.dirname, "style")];

// Builds the site as the command line asks. With --serve or --watch, it
// keeps running and rebuilds after each change in the site folder.
export async function run(site: SiteConfig, args: string[] = process.argv.slice(2)): Promise<void> {
  let values;
  try {
    ({ values } = parseArgs({
      args,
      options: {
        check: { type: "boolean" },
        serve: { type: "boolean" },
        watch: { type: "boolean" },
        port: { type: "string" },
        host: { type: "string" },
        quiet: { type: "boolean" },
        help: { type: "boolean" },
      },
    }));
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (values.help) return void console.log(USAGE);
  const builder = new Builder(site);
  const quiet = !!values.quiet;
  if (values.check) return void (await builder.build({ check: true, quiet }));
  if (values.serve) builder.head.push(RELOAD_SCRIPT);
  await builder.build({ quiet });
  if (!values.serve && !values.watch) return;

  let server: SiteServer | undefined;
  if (values.serve) server = serve(site, { port: values.port ? Number(values.port) : undefined, host: values.host });
  const { config } = builder;
  const ignored = [config.out, config.cache, join(config.root, "node_modules"), join(config.root, ".git")].map((d) => d + sep);
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  let again = false;
  const rebuild = async () => {
    if (running) return void (again = true);
    running = true;
    do {
      again = false;
      const started = performance.now();
      process.exitCode = 0;
      const result = await builder.build({ quiet: true });
      if (result.ok) {
        if (!quiet) console.log(`Rebuilt in ${formatMs(performance.now() - started)}: ${result.changed} file(s) changed.`);
        if (result.changed) server?.reload();
      }
    } while (again);
    running = false;
  };
  const changed = (dir: string) => (_event: string, name: string | null) => {
    const path = join(dir, name ?? "");
    if (ignored.some((d) => (path + sep).startsWith(d))) return;
    clearTimeout(timer);
    timer = setTimeout(() => void rebuild(), 40);
  };
  for (const dir of [config.root, ...GGASS_FOLDERS.filter((d) => relative(config.root, d).startsWith(".."))])
    watch(dir, { recursive: true }, changed(dir)).on("error", (e) => console.error(`watch ${dir}: ${e.message}`));
  if (!quiet) console.log("Watching for changes. Press Ctrl+C to stop.");
}
