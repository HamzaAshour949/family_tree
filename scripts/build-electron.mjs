#!/usr/bin/env node
/**
 * Compiles the Electron main process and preload to CommonJS.
 *
 * The repository is an ES module package, so the emitted files need their own
 * package manifest to be interpreted as CommonJS by Electron's loader.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = "dist-electron";
const tsc = process.platform === "win32" ? "tsc.cmd" : "tsc";

execFileSync(join("node_modules", ".bin", tsc), ["-p", "tsconfig.electron.json"], { stdio: "inherit" });
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "package.json"), `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`);
