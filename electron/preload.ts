import { contextBridge, ipcRenderer } from "electron";
import { IPC, type ConfirmRequest, type DesktopBridge, type ExportFileRequest, type MenuAction, type OpenedProjectFile, type SaveProjectRequest } from "./shared";

/**
 * The only surface the renderer gets. Every entry is an explicit, narrowly
 * typed call - no Node primitives and no raw ipcRenderer are exposed.
 */
const bridge: DesktopBridge = {
  appVersion: readSwitch("--app-version") ?? "0.0.0",
  platform: process.platform,
  confirm: (request: ConfirmRequest) => ipcRenderer.invoke(IPC.confirm, request),
  exportFile: (request: ExportFileRequest) => ipcRenderer.invoke(IPC.exportFile, request),
  openProject: () => ipcRenderer.invoke(IPC.openProject),
  takePendingFile: () => ipcRenderer.invoke(IPC.takePendingFile),
  saveProject: (request: SaveProjectRequest) => ipcRenderer.invoke(IPC.saveProject, request),
  setDocumentEdited: (edited: boolean, filePath?: string) => ipcRenderer.send(IPC.setDocumentEdited, edited, filePath),
  reportSaveResult: (saved: boolean) => ipcRenderer.send(IPC.saveResult, saved),
  onMenuAction: (listener) => subscribe<MenuAction>(IPC.menuAction, listener),
  onOpenFile: (listener) => subscribe<OpenedProjectFile>(IPC.openedFile, listener),
};

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
