import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/**
 * The packaged renderer is loaded from `file://`, so a locked-down policy is
 * injected at build time only. (`frame-ancestors` is deliberately absent: it is
 * only honoured as an HTTP header and is ignored - with a console error - in a
 * `<meta>` tag. The window never embeds or is embedded in a frame anyway.) In development Vite's HMR client needs inline
 * scripts, which the policy below intentionally does not allow.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function contentSecurityPolicy(): Plugin {
  return {
    name: "family-tree-studio:csp",
    apply: "build",
    transformIndexHtml: (html) =>
      // Inserted after the charset declaration, which must stay first.
      html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`),
  };
}

export default defineConfig({
  // Relative asset URLs so the bundle works when served from `file://`.
  base: "./",
  plugins: [react(), contentSecurityPolicy()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        // Keeps the heavy, rarely-changing libraries out of the app chunk so a
        // code change does not invalidate megabytes of vendor bundle.
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@xyflow")) return "vendor-flow";
          if (id.includes("react")) return "vendor-react";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "shell/**/*.test.ts"],
    restoreMocks: true,
  },
});
