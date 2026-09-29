#!/usr/bin/env node
/**
 * Launches the built app inside Electron and drives it over the DevTools
 * protocol to confirm it boots and the pieces the unit tests cannot reach are
 * wired together: the preload bridge, the renderer's isolation, the launch-file
 * path through the main process, and a round trip through the editor.
 *
 * This exists because a broken preload is invisible from the outside: the
 * window still renders, it just silently loses every file operation.
 *
 * Requires `npm run build` first, and a display - on a headless machine run it
 * under a virtual one, e.g. `xvfb-run -a npm run smoke`.
 *
 * The renderer runs in Chromium's sandbox, and this test is more meaningful
 * with it on. On Linux that needs either unprivileged user namespaces or the
 * setuid helper
 * (`chown root node_modules/electron/dist/chrome-sandbox && chmod 4755 ...`).
 * Where neither is available - a container running as root, say - pass
 * `--no-sandbox`: extra arguments are forwarded to Electron.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createRequire } from "node:module";

// `SMOKE_APP` points the checks at an already packaged binary; without it the
// app runs from source through the local Electron install.
const packagedApp = process.env.SMOKE_APP;
const electron = packagedApp ?? createRequire(import.meta.url)("electron");
const DEBUG_PORT = Number(process.env.SMOKE_PORT ?? 9222);
const READY_TIMEOUT_MS = 30_000;
/** Relative on purpose: it is resolved against this process's working directory by the main process. */
const LAUNCH_FILE = "examples/sample-family.ftree";
const BRIDGE_CALLS = [
  "confirm",
  "exportFile",
  "onMenuAction",
  "onOpenFile",
  "openProject",
  "reportSaveResult",
  "saveProject",
  "setDocumentState",
  "setShellStrings",
  "takePendingFile",
];
const checks = [];
let nextMessageId = 0;

// A private profile keeps this run out of the user's own single-instance lock and settings.
const profile = mkdtempSync(join(tmpdir(), "fts-smoke-"));
const app = spawn(
  electron,
  [`--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, ...process.argv.slice(2), ...(packagedApp ? [] : ["."]), LAUNCH_FILE],
  { stdio: "inherit" },
);
let socket;

try {
  const page = await waitForPage();
  socket = await connect(page.webSocketDebuggerUrl);
  await waitFor("() => !!document.querySelector('.react-flow__node')", "the project named on the command line to load");

  expect("renderer loads the built bundle", page.url.endsWith("dist/index.html"));
  expect("editor shell renders without a gate", await evaluate("!!document.querySelector('.app-shell')"));
  expect("a Content-Security-Policy is in force", await evaluate("!!document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]')"));

  // The bridge.
  expect("preload bridge is exposed", (await evaluate("typeof window.desktop")) === "object");
  expect("every bridge call is callable", await evaluate(`${JSON.stringify(BRIDGE_CALLS)}.every((key) => typeof window.desktop[key] === 'function')`));
  expect("app version reaches the renderer", /^\d+\.\d+\.\d+/.test(String(await evaluate("window.desktop.appVersion"))));
  expect("platform reaches the renderer", ["darwin", "win32", "linux"].includes(await evaluate("window.desktop.platform")));

  // Isolation: the page must not see Node.
  expect("Node is not exposed to the page", (await evaluate("[typeof require, typeof process, typeof Buffer].join()")) === "undefined,undefined,undefined");

  // A relative path on the command line is resolved and opened by the main process.
  // Everything past the first node depends on React Flow measuring the cards,
  // which happens asynchronously, so these wait for the end state rather than
  // sampling it once - a slow machine must not read as a failure.
  await eventually("the launch file is opened", "document.querySelectorAll('.react-flow__node').length === 8");
  await eventually(
    "its relationships are drawn",
    "document.querySelectorAll('.react-flow__edge').length === 11",
    "[...document.querySelectorAll('.react-flow__edge')].map((edge) => edge.dataset.id).join(',')",
  );
  await eventually("the tree is fitted into view", "!!document.querySelector('.react-flow__viewport') && document.querySelector('.react-flow__viewport').style.transform !== 'translate(0px, 0px) scale(1)'");
  await eventually("the minimap draws the people", "document.querySelectorAll('.react-flow__minimap-node').length === 8");
  await eventually("the project name is shown", "document.querySelector('.brand-project')?.textContent === 'Nasser Family'");
  await eventually("an opened project starts clean", "!document.querySelector('.dirty-dot')");

  // A round trip through the editor.
  await evaluate("document.querySelector('.react-flow__node[data-id=\"p3\"] .person-node').click()");
  await eventually("selecting a person opens their profile", "document.querySelector('.inspector .panel-title')?.textContent === 'Omar Nasser'");
  await evaluate("[...document.querySelectorAll('.quick-add .text-button')].find((button) => button.textContent.includes('Add son')).click()");
  await eventually("adding a relative draws a node", "document.querySelectorAll('.react-flow__node').length === 9");
  await eventually("editing marks the document dirty", "!!document.querySelector('.dirty-dot')");
  await eventually("the new person's name is ready to type", "document.activeElement?.tagName === 'INPUT'");

  await evaluate("document.querySelector('[aria-label=\"Undo\"]').click()");
  await eventually("undo removes the relative", "document.querySelectorAll('.react-flow__node').length === 8");
  await eventually("undoing back to the opened state reads as clean", "!document.querySelector('.dirty-dot')");

  // Right-to-left.
  await evaluate(
    "(() => { const el = document.querySelector('.language-select'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(el, 'ar'); el.dispatchEvent(new Event('change', { bubbles: true })); })()",
  );
  await eventually("switching to Arabic mirrors the layout", "document.documentElement.dir === 'rtl'");
  await eventually("the interface is translated", "document.querySelector('[role=\"tab\"]')?.textContent === 'الشجرة'");
} catch (error) {
  checks.push({ name: `run completed (${error instanceof Error ? error.message : error})`, ok: false });
} finally {
  socket?.close();
  await shutDown(app);
  // Electron may still be flushing files for a moment after it exits.
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? "ok  " : "FAIL"} ${check.name}`);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length > 0 && pageLog.length > 0) console.log(`\npage warnings and errors:\n${[...new Set(pageLog)].slice(0, 15).join("\n")}`);
process.exit(failed.length === 0 ? 0 : 1);

/** Stops the app and waits for it to be gone, so its profile is no longer being written to. */
async function shutDown(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, delay(10_000)]);
}

function expect(name, ok) {
  checks.push({ name, ok: Boolean(ok) });
}

/**
 * Records a check that passes as soon as `expression` is truthy, or fails if it
 * never is within the timeout. `observe` is an optional expression whose value
 * is reported on failure, so a red check says what was actually there.
 */
async function eventually(name, expression, observe, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let ok = false;
  while (!ok && Date.now() < deadline) {
    ok = Boolean(await evaluate(expression));
    if (!ok) await delay(150);
  }
  const detail = ok || !observe ? "" : ` [observed: ${JSON.stringify(await evaluate(observe))}]`;
  expect(`${name}${detail}`, ok);
}

async function waitFor(predicate, description, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(`(${predicate})()`)) return;
    await delay(200);
  }
  throw new Error(`timed out waiting for ${description}`);
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

/** Warnings and errors the page logged, shown when a check fails: React Flow reports why it cannot draw an edge there. */
const pageLog = [];

function connect(url) {
  const ws = new WebSocket(url);
  return new Promise((resolve, reject) => {
    ws.onopen = () => {
      ws.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.method !== "Runtime.consoleAPICalled" || !["error", "warning"].includes(message.params?.type)) return;
        const text = (message.params.args ?? []).map((arg) => arg.value ?? arg.description ?? "").join(" ");
        pageLog.push(`[${message.params.type}] ${text}`.slice(0, 300));
      });
      ws.send(JSON.stringify({ id: 9_000_000, method: "Runtime.enable" }));
      resolve(ws);
    };
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
