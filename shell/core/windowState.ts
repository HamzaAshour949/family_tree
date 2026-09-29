import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface WindowState {
  width: number;
  height: number;
  maximized: boolean;
}

export const DEFAULT_WINDOW_STATE: WindowState = { width: 1440, height: 920, maximized: false };
export const MIN_WINDOW_SIZE = { width: 980, height: 680 };
const MAX_DIMENSION = 10_000;

/** Turns whatever is on disk into a usable size, ignoring anything implausible. */
export function parseWindowState(raw: string | undefined): WindowState {
  if (!raw) return DEFAULT_WINDOW_STATE;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return DEFAULT_WINDOW_STATE;
  }
  if (typeof value !== "object" || value === null) return DEFAULT_WINDOW_STATE;
  const record = value as Record<string, unknown>;
  return {
    width: dimension(record.width, MIN_WINDOW_SIZE.width, DEFAULT_WINDOW_STATE.width),
    height: dimension(record.height, MIN_WINDOW_SIZE.height, DEFAULT_WINDOW_STATE.height),
    maximized: record.maximized === true,
  };
}

function dimension(value: unknown, minimum: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_DIMENSION, Math.max(minimum, Math.round(value)));
}

export function loadWindowState(path: string): WindowState {
  try {
    return parseWindowState(readFileSync(path, "utf8"));
  } catch {
    return DEFAULT_WINDOW_STATE;
  }
}

/** Best effort: losing the remembered size is never worth interrupting the user. */
export function saveWindowState(path: string, state: WindowState): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(state));
  } catch {
    // Read-only profile directory, full disk: the window just opens at the default size next time.
  }
}
