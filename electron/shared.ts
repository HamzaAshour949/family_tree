/**
 * Contract shared by the Electron main process, the preload bridge and the
 * renderer. Only `import type` is used on the renderer side, so nothing in
 * here ends up in the web bundle.
 */

export const IPC = {
  confirm: "dialog:confirm",
  exportFile: "file:export",
  openProject: "file:open-project",
  saveProject: "file:save-project",
  setDocumentEdited: "window:set-document-edited",
  menuAction: "menu:action",
  openedFile: "file:opened",
  takePendingFile: "file:take-pending",
  saveResult: "window:save-result",
} as const;

export type MenuAction =
  | "new-project"
  | "open-project"
  | "save-project"
  | "save-project-as"
  | "export-pdf"
  | "export-png"
  | "export-svg"
  | "add-person"
  | "view-timeline"
  | "view-tree"
  | "toggle-theme";

export type ExportFormat = "pdf" | "png" | "svg";

export interface OpenedProjectFile {
  filePath: string;
  contents: string;
}

export interface SaveProjectRequest {
  /** Existing path to overwrite. When omitted the user is prompted. */
  filePath?: string;
  contents: string;
  suggestedName: string;
}

export interface ExportFileRequest {
  data: string | Uint8Array;
  format: ExportFormat;
  suggestedName: string;
}

export interface ConfirmRequest {
  cancelLabel: string;
  confirmLabel: string;
  message: string;
  title: string;
}

export interface DesktopBridge {
  appVersion: string;
  platform: NodeJS.Platform;
  confirm: (request: ConfirmRequest) => Promise<boolean>;
  exportFile: (request: ExportFileRequest) => Promise<string | null>;
  openProject: () => Promise<OpenedProjectFile | null>;
  /** Claims a project the shell asked to open before the app was ready. */
  takePendingFile: () => Promise<OpenedProjectFile | null>;
  saveProject: (request: SaveProjectRequest) => Promise<string | null>;
  setDocumentEdited: (edited: boolean, filePath?: string) => void;
  reportSaveResult: (saved: boolean) => void;
  onMenuAction: (listener: (action: MenuAction) => void) => () => void;
  onOpenFile: (listener: (file: OpenedProjectFile) => void) => () => void;
}
