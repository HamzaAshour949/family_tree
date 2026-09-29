import { basename } from "node:path";
import type { DesktopPlatform, DocumentState } from "../../shared/desktop";

/**
 * Window title: the file name, or the project name until it has been saved,
 * followed by the app name. macOS reports unsaved changes through the close
 * button and the title-bar proxy icon, so only other platforms get a marker.
 */
export function windowTitle(appName: string, state: DocumentState, platform: DesktopPlatform): string {
  const document = state.filePath ? basename(state.filePath) : state.name.trim();
  const marker = state.dirty && platform !== "darwin" ? "• " : "";
  return `${marker}${[document, appName].filter(Boolean).join(" - ")}`;
}
