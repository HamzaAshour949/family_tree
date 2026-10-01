/**
 * The contract between the web renderer and whichever native shell hosts it.
 *
 * Nothing in here knows about a specific shell. The renderer only ever sees
 * `window.desktop`, and a shell's job is to provide an object of this shape -
 * today through Electron's preload script, and the same contract would be met
 * by any other host (for example an RPC bridge) without touching the app.
 *
 * Only types and constants live here, so importing it costs the web bundle
 * nothing.
 */

export const PROJECT_EXTENSION = "ftree";

/** Channel names used by shells that speak over message passing. */
export const IPC = {
  confirm: "dialog:confirm",
  exportFile: "file:export",
  openProject: "file:open-project",
  saveProject: "file:save-project",
  setDocumentState: "window:set-document-state",
  setShellStrings: "window:set-shell-strings",
  menuAction: "menu:action",
  openedFile: "file:opened",
  takePendingFile: "file:take-pending",
  saveResult: "window:save-result",
} as const;

export type DesktopPlatform = "darwin" | "win32" | "linux";

/** Native menu items and shortcuts drive the app through these names. */
export type MenuAction =
  | "new-project"
  | "open-project"
  | "save-project"
  | "save-project-as"
  | "export-pdf"
  | "export-png"
  | "export-svg"
  | "undo"
  | "redo"
  | "add-person"
  | "view-timeline"
  | "view-tree"
  | "toggle-theme";

export type ExportFormat = "pdf" | "png" | "svg";
export const EXPORT_FORMATS: readonly ExportFormat[] = ["pdf", "png", "svg"];

export interface OpenedProjectFile {
  filePath: string;
  contents: string;
}

export interface SaveProjectRequest {
  /** Existing path to overwrite. When omitted, or not one the user granted, they are prompted. */
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

export interface DocumentState {
  dirty: boolean;
  filePath?: string;
  /** Project name, shown in the window title when no file is open yet. */
  name: string;
}

/**
 * Everything the shell shows without asking the renderer: menu labels and the
 * dialogs it raises itself. The renderer sends these whenever the language
 * changes so native chrome always matches the interface.
 */
export const SHELL_STRING_KEYS = [
  "menuFile",
  "menuNewProject",
  "menuOpenProject",
  "menuSave",
  "menuSaveAs",
  "menuExport",
  "menuExportPdf",
  "menuExportPng",
  "menuExportSvg",
  "menuEdit",
  "menuUndo",
  "menuRedo",
  "menuView",
  "menuTree",
  "menuTimeline",
  "menuToggleTheme",
  "menuFamily",
  "menuAddPerson",
  "menuAbout",
  "menuServices",
  "menuHide",
  "menuHideOthers",
  "menuShowAll",
  "menuQuit",
  "menuExit",
  "menuCloseWindow",
  "menuCut",
  "menuCopy",
  "menuPaste",
  "menuSelectAll",
  "menuActualSize",
  "menuZoomIn",
  "menuZoomOut",
  "menuFullScreen",
  "menuDevTools",
  "menuWindow",
  "menuMinimize",
  "menuZoomWindow",
  "menuBringAllToFront",
  "closeTitle",
  "closeMessage",
  "closeDetail",
  "closeSave",
  "closeDiscard",
  "closeCancel",
  "openFailedTitle",
  "openFailedMessage",
] as const;

export type ShellStringKey = (typeof SHELL_STRING_KEYS)[number];
export type ShellStrings = Record<ShellStringKey, string>;

/**
 * English defaults, used until the renderer reports its own. `{name}` is
 * replaced with a file name in dialogs and with the app's name in the menu.
 */
export const DEFAULT_SHELL_STRINGS: ShellStrings = {
  menuFile: "File",
  menuNewProject: "New Project",
  menuOpenProject: "Open Project...",
  menuSave: "Save",
  menuSaveAs: "Save As...",
  menuExport: "Export",
  menuExportPdf: "As PDF",
  menuExportPng: "As PNG Image",
  menuExportSvg: "As SVG Image",
  menuEdit: "Edit",
  menuUndo: "Undo",
  menuRedo: "Redo",
  menuView: "View",
  menuTree: "Tree",
  menuTimeline: "Timeline",
  menuToggleTheme: "Toggle Theme",
  menuFamily: "Family",
  menuAddPerson: "Add Person",
  menuAbout: "About {name}",
  menuServices: "Services",
  menuHide: "Hide {name}",
  menuHideOthers: "Hide Others",
  menuShowAll: "Show All",
  menuQuit: "Quit {name}",
  menuExit: "Exit",
  menuCloseWindow: "Close Window",
  menuCut: "Cut",
  menuCopy: "Copy",
  menuPaste: "Paste",
  menuSelectAll: "Select All",
  menuActualSize: "Actual Size",
  menuZoomIn: "Zoom In",
  menuZoomOut: "Zoom Out",
  menuFullScreen: "Toggle Full Screen",
  menuDevTools: "Toggle Developer Tools",
  menuWindow: "Window",
  menuMinimize: "Minimize",
  menuZoomWindow: "Zoom",
  menuBringAllToFront: "Bring All to Front",
  closeTitle: "Unsaved changes",
  closeMessage: "Save changes before closing?",
  closeDetail: "Your family tree has changes that have not been written to disk.",
  closeSave: "Save",
  closeDiscard: "Discard",
  closeCancel: "Cancel",
  openFailedTitle: "Could not open project",
  openFailedMessage: "{name} could not be read.",
};

export interface DesktopBridge {
  appVersion: string;
  platform: DesktopPlatform;
  confirm: (request: ConfirmRequest) => Promise<boolean>;
  exportFile: (request: ExportFileRequest) => Promise<string | null>;
  openProject: () => Promise<OpenedProjectFile | null>;
  /** Claims a project the shell was asked to open before the app was ready. */
  takePendingFile: () => Promise<OpenedProjectFile | null>;
  saveProject: (request: SaveProjectRequest) => Promise<string | null>;
  /** Keeps the title bar, the close guard and the OS document indicator in sync. */
  setDocumentState: (state: DocumentState) => void;
  setShellStrings: (strings: ShellStrings) => void;
  reportSaveResult: (saved: boolean) => void;
  onMenuAction: (listener: (action: MenuAction) => void) => () => void;
  onOpenFile: (listener: (file: OpenedProjectFile) => void) => () => void;
}
