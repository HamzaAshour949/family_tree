import type { DesktopBridge } from "../../shared/desktop";

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

/**
 * The renderer is only ever loaded inside Electron, but guarding the bridge
 * keeps `vite dev` in a plain browser tab usable and turns a missing preload
 * into a readable error instead of `undefined is not a function`.
 */
export function desktop(): DesktopBridge {
  const bridge = window.desktop;
  if (!bridge) throw new Error("Desktop features are unavailable: the application bridge did not load.");
  return bridge;
}

export function hasDesktopBridge(): boolean {
  return Boolean(window.desktop);
}

export type { DesktopBridge, MenuAction, OpenedProjectFile } from "../../shared/desktop";
