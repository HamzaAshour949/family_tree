#!/usr/bin/env node
/**
 * Builds the Electron main process and preload script.
 *
 * Each entry is built on its own so that the shared IPC contract is inlined
 * into both outputs; a sandboxed preload cannot require a sibling chunk. The
 * repository is an ES module package, so the emitted CommonJS files also need
 * their own manifest for Electron's loader to read them correctly.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = "dist-electron";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

rmSync(outDir, { force: true, recursive: true });
mkdirSync(outDir, { recursive: true });

for (const entry of ["main", "preload"]) {
  execFileSync(npx, ["vite", "build", "--config", "vite.electron.config.ts"], {
    stdio: "inherit",
    env: { ...process.env, ELECTRON_ENTRY: entry },
  });
}

writeFileSync(join(outDir, "package.json"), `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`);
