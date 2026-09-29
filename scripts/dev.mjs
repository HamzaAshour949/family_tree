#!/usr/bin/env node
/**
 * Development runner: starts the Vite dev server, builds the Electron entries,
 * then launches Electron against the server. Quitting either one tears the
 * whole session down.
 *
 * Vite runs through its Node API rather than the `vite` binary, because
 * Node will not spawn `.cmd` shims on Windows without a shell.
 */
import { spawn } from "node:child_process";
import { createServer } from "vite";
import electron from "electron";
import { buildShell } from "./build-shell.mjs";

const server = await createServer({ server: { port: 5173, strictPort: true } });
await server.listen();

const devServerUrl = server.resolvedUrls?.local?.[0] ?? "http://localhost:5173";
server.printUrls();

await buildShell();

const app = spawn(electron, ["."], {
  stdio: "inherit",
  env: { ...process.env, VITE_DEV_SERVER_URL: devServerUrl },
});

app.on("exit", (code) => void shutdown(code ?? 0));
process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));

async function shutdown(code) {
  app.kill();
  await server.close().catch(() => undefined);
  process.exit(code);
}
