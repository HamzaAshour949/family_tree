#!/usr/bin/env node
/**
 * Development runner: starts Vite, waits for the dev server to answer, then
 * launches Electron against it. Keeps the two processes in lockstep so that
 * quitting either one tears the whole session down.
 */
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import electron from "electron";

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
const STARTUP_TIMEOUT_MS = 60_000;
const children = new Set();

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const vite = run(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "--port", new URL(DEV_SERVER_URL).port, "--strictPort"]);
vite.on("exit", (code) => shutdown(code ?? 0));

await Promise.all([waitForServer(DEV_SERVER_URL), buildElectron()]);

const app = run(electron, ["."], { VITE_DEV_SERVER_URL: DEV_SERVER_URL });
app.on("exit", (code) => shutdown(code ?? 0));

function run(command, args, env = {}) {
  const child = spawn(command, args, { stdio: "inherit", env: { ...process.env, ...env } });
  children.add(child);
  child.on("exit", () => children.delete(child));
  return child;
}

function buildElectron() {
  return new Promise((resolve, reject) => {
    const build = run(process.execPath, ["scripts/build-electron.mjs"]);
    build.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Electron build failed with code ${code}`))));
  });
}

async function waitForServer(url) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(1000) });
      return;
    } catch {
      await delay(200);
    }
  }
  throw new Error(`Vite dev server did not start at ${url}`);
}

function shutdown(code = 0) {
  for (const child of children) child.kill();
  process.exit(typeof code === "number" ? code : 0);
}
