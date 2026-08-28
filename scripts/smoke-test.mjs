#!/usr/bin/env node
/**
 * Launches the packaged renderer inside Electron and drives it over the
 * DevTools protocol to confirm the app actually boots.
 *
 * This exists because a broken preload is invisible from the outside: the
 * window still renders, it just silently loses every file operation.
 *
 * Requires `npm run build` first. On a headless machine, run it under a
 * virtual display, e.g. `xvfb-run -a npm run smoke`.
 */
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { createRequire } from "node:module";

const electron = createRequire(import.meta.url)("electron");
const DEBUG_PORT = 9222;
const READY_TIMEOUT_MS = 30_000;
const checks = [];
let nextMessageId = 0;

const app = spawn(electron, [`--remote-debugging-port=${DEBUG_PORT}`, ...process.argv.slice(2), "."], { stdio: "inherit" });
let socket;

try {
  const page = await waitForPage();
  socket = await connect(page.webSocketDebuggerUrl);
  await delay(2000);

  expect("renderer loads the built bundle", page.url.endsWith("dist/index.html"));
  expect("editor shell renders without a gate", await evaluate("!!document.querySelector('.app-shell')"));
  expect("preload bridge is exposed", (await evaluate("typeof window.desktop")) === "object");
  expect(
    "every bridge call is callable",
    (await evaluate("['openProject','saveProject','exportFile','confirm','onMenuAction','onOpenFile'].every((key) => typeof window.desktop[key] === 'function')")),
  );
  expect("app version reaches the renderer", /^\d+\.\d+\.\d+$/.test(String(await evaluate("window.desktop.appVersion"))));

  await evaluate("document.querySelector('.inspector .primary-button')?.click()");
  await delay(1500);
  expect("adding a person renders a node", (await evaluate("document.querySelectorAll('.react-flow__node').length")) === 1);
  expect("editing marks the document dirty", await evaluate("!!document.querySelector('.dirty-dot')"));
} finally {
  socket?.close();
  app.kill();
}

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? "ok  " : "FAIL"} ${check.name}`);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);

function expect(name, ok) {
  checks.push({ name, ok: Boolean(ok) });
}

async function waitForPage() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json();
      const page = targets.find((target) => target.type === "page");
      if (page) return page;
    } catch {
      // The debugger endpoint is not listening yet.
    }
    await delay(250);
  }
  throw new Error("Electron did not expose a page target in time.");
}

function connect(url) {
  const ws = new WebSocket(url);
  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error("Could not attach to the renderer."));
  });
}

function evaluate(expression) {
  const id = (nextMessageId += 1);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out evaluating: ${expression}`)), 10_000);
    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      clearTimeout(timer);
      socket.removeEventListener("message", onMessage);
      resolve(message.result?.result?.value);
    };
    socket.addEventListener("message", onMessage);
    socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
  });
}
