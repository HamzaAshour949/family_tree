#!/usr/bin/env node
/**
 * Builds the Electron main process and preload script.
 *
 * Each entry is built separately so that the shared IPC contract is inlined
 * into both outputs - a sandboxed preload cannot require a sibling chunk.
 *
 * Vite is driven through its Node API rather than the `vite` binary: on
 * Windows, Node refuses to spawn `.cmd` shims without a shell.
 */
import { builtinModules } from "node:module";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "vite";

const OUT_DIR = "dist-electron";
const EXTERNAL = ["electron", ...builtinModules, ...builtinModules.map((name) => `node:${name}`)];

export function electronConfig(entry) {
  return {
    configFile: false,
    build: {
      outDir: OUT_DIR,
      emptyOutDir: false,
      target: "node20",
      minify: false,
      sourcemap: true,
      lib: { entry: { [entry]: `electron/${entry}.ts` }, formats: ["cjs"] },
      rollupOptions: { external: EXTERNAL, output: { entryFileNames: "[name].js" } },
    },
  };
}

export async function buildElectron() {
  rmSync(OUT_DIR, { force: true, recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  for (const entry of ["main", "preload"]) {
    await build(electronConfig(entry));
  }
  // The repository is an ES module package, so the emitted CommonJS files need
  // their own manifest for Electron's loader to read them correctly.
  writeFileSync(join(OUT_DIR, "package.json"), `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`);
}

// Only run when invoked directly, so `dev.mjs` can import and reuse it.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("build-electron.mjs")) {
  await buildElectron();
}
