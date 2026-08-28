import { builtinModules } from "node:module";
import { defineConfig } from "vite";

/**
 * Builds one Electron entry point, named by `ELECTRON_ENTRY`.
 *
 * Main and preload are built separately and on purpose: a sandboxed preload
 * cannot `require` relative modules, so the shared IPC contract must be
 * inlined into each output rather than hoisted into a chunk they both import.
 */
const entry = process.env.ELECTRON_ENTRY ?? "main";

export default defineConfig({
  build: {
    outDir: "dist-electron",
    emptyOutDir: false,
    target: "node20",
    minify: false,
    sourcemap: true,
    lib: { entry: { [entry]: `electron/${entry}.ts` }, formats: ["cjs"] },
    rollupOptions: {
      external: ["electron", ...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
      output: { entryFileNames: "[name].js" },
    },
  },
});
