import { contextBridge, ipcRenderer } from "electron";
import {
  IPC,
  type ConfirmRequest,
  type DesktopBridge,
  type DesktopPlatform,
  type DocumentState,
  type ExportFileRequest,
  type MenuAction,
  type OpenedProjectFile,
  type SaveProjectRequest,
  type ShellStrings,
} from "../../shared/desktop";

/**
 * The only surface the renderer gets. Every entry is an explicit, narrowly
 * typed call - no Node primitives and no raw ipcRenderer are exposed.
 */
const bridge: DesktopBridge = {
  appVersion: readSwitch("--app-version") ?? "0.0.0",
  platform: currentPlatform(),
  confirm: (request: ConfirmRequest) => invoke(IPC.confirm, request),
  exportFile: (request: ExportFileRequest) => invoke(IPC.exportFile, request),
  openProject: () => invoke(IPC.openProject),
  takePendingFile: () => invoke(IPC.takePendingFile),
  saveProject: (request: SaveProjectRequest) => invoke(IPC.saveProject, request),
  setDocumentState: (state: DocumentState) => ipcRenderer.send(IPC.setDocumentState, state),
  setShellStrings: (strings: ShellStrings) => ipcRenderer.send(IPC.setShellStrings, strings),
  reportSaveResult: (saved: boolean) => ipcRenderer.send(IPC.saveResult, saved),
  onMenuAction: (listener) => subscribe<MenuAction>(IPC.menuAction, listener),
  onOpenFile: (listener) => subscribe<OpenedProjectFile>(IPC.openedFile, listener),
};

/**
 * Electron prefixes a rejected invoke with "Error invoking remote method
 * '<channel>': Error: ". That plumbing detail should not reach the user, so the
 * original message is passed on instead.
 */
async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  try {
    return (await ipcRenderer.invoke(channel, payload)) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message.replace(/^Error invoking remote method '[^']*': (?:\w*Error: )?/, ""));
  }
}

function currentPlatform(): DesktopPlatform {
  return process.platform === "darwin" || process.platform === "win32" ? process.platform : "linux";
}

/** Reads a `--name=value` switch handed to the renderer by the main process. */
function readSwitch(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
}

contextBridge.exposeInMainWorld("desktop", bridge);
