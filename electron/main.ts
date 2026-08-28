import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type MenuItemConstructorOptions } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { IPC, type ConfirmRequest, type ExportFileRequest, type MenuAction, type OpenedProjectFile, type SaveProjectRequest } from "./shared";

const PROJECT_EXTENSION = "ftree";
const PROJECT_FILTERS = [{ name: "Family Tree Project", extensions: [PROJECT_EXTENSION] }];
const EXPORT_FILTERS = {
  pdf: [{ name: "PDF Document", extensions: ["pdf"] }],
  png: [{ name: "PNG Image", extensions: ["png"] }],
  svg: [{ name: "SVG Image", extensions: ["svg"] }],
};
const SAVE_ACK_TIMEOUT_MS = 60_000;
const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const rendererRoot = join(__dirname, "..", "dist");

let mainWindow: BrowserWindow | undefined;
let documentEdited = false;
let documentPath: string | undefined;
let closeConfirmed = false;
let pendingSaveAck: ((saved: boolean) => void) | undefined;
/** A file passed on the command line or via the macOS `open-file` event. */
let queuedFilePath = fileArgument(process.argv);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void bootstrap();
}

async function bootstrap(): Promise<void> {
  app.on("second-instance", (_event, argv) => {
    const requested = fileArgument(argv);
    if (requested) void deliverFile(requested);
    focusMainWindow();
  });

  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    if (app.isReady()) void deliverFile(filePath);
    else queuedFilePath = filePath;
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createMainWindow();
    else focusMainWindow();
  });

  registerIpcHandlers();
  await app.whenReady();
  Menu.setApplicationMenu(buildMenu());
  await createMainWindow();
}

async function createMainWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: "#101214",
    title: app.getName(),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      additionalArguments: [`--app-version=${app.getVersion()}`],
    },
  });

  mainWindow = window;
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = undefined;
  });
  window.on("close", (event) => {
    if (closeConfirmed || !documentEdited) return;
    event.preventDefault();
    void confirmClose(window);
  });

  hardenNavigation(window);

  // A preload failure would otherwise be silent, leaving the renderer with no
  // file access and no indication why.
  window.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(`[preload] ${preloadPath} failed to load:`, error);
  });

  if (devServerUrl) {
    await window.loadURL(devServerUrl);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    await window.loadFile(join(rendererRoot, "index.html"));
  }

  if (queuedFilePath) {
    const requested = queuedFilePath;
    queuedFilePath = undefined;
    await deliverFile(requested);
  }
}

/**
 * The renderer only ever renders local content. Anything trying to navigate
 * elsewhere - or open a window - is handed to the system browser instead.
 */
function hardenNavigation(window: BrowserWindow): void {
  const isInternal = (target: string) => {
    if (devServerUrl && target.startsWith(devServerUrl)) return true;
    return target.startsWith(pathToFileURL(rendererRoot).toString());
  };

  window.webContents.on("will-navigate", (event, target) => {
    if (isInternal(target)) return;
    event.preventDefault();
    void openExternal(target);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
}

async function openExternal(target: string): Promise<void> {
  const protocol = safeProtocol(target);
  if (protocol === "https:" || protocol === "mailto:") await shell.openExternal(target);
}

function safeProtocol(target: string): string | undefined {
  try {
    return new URL(target).protocol;
  } catch {
    return undefined;
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC.openProject, async (event): Promise<OpenedProjectFile | null> => {
    const window = senderWindow(event);
    if (!window) return null;
    const result = await dialog.showOpenDialog(window, { properties: ["openFile"], filters: PROJECT_FILTERS });
    const [filePath] = result.filePaths;
    if (result.canceled || !filePath) return null;
    return { filePath, contents: await readFile(filePath, "utf8") };
  });

  ipcMain.handle(IPC.saveProject, async (event, request: SaveProjectRequest): Promise<string | null> => {
    const window = senderWindow(event);
    if (!window) return null;
    let filePath = request.filePath;
    if (!filePath) {
      const result = await dialog.showSaveDialog(window, {
        defaultPath: `${request.suggestedName}.${PROJECT_EXTENSION}`,
        filters: PROJECT_FILTERS,
      });
      if (result.canceled || !result.filePath) return null;
      filePath = result.filePath;
    }
    await writeFile(filePath, request.contents, "utf8");
    return filePath;
  });

  ipcMain.handle(IPC.exportFile, async (event, request: ExportFileRequest): Promise<string | null> => {
    const window = senderWindow(event);
    if (!window) return null;
    const result = await dialog.showSaveDialog(window, {
      defaultPath: `${request.suggestedName}.${request.format}`,
      filters: EXPORT_FILTERS[request.format] ?? [],
    });
    if (result.canceled || !result.filePath) return null;
    const data = typeof request.data === "string" ? request.data : Buffer.from(request.data);
    await writeFile(result.filePath, data);
    return result.filePath;
  });

  ipcMain.handle(IPC.confirm, async (event, request: ConfirmRequest): Promise<boolean> => {
    const window = senderWindow(event);
    if (!window) return false;
    const { response } = await dialog.showMessageBox(window, {
      type: "warning",
      title: request.title,
      message: request.title,
      detail: request.message,
      buttons: [request.confirmLabel, request.cancelLabel],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    return response === 0;
  });

  ipcMain.on(IPC.setDocumentEdited, (event, edited: unknown, filePath: unknown) => {
    const window = senderWindow(event);
    if (!window) return;
    documentEdited = Boolean(edited);
    documentPath = typeof filePath === "string" && filePath.length > 0 ? filePath : undefined;
    window.setDocumentEdited(documentEdited);
    window.setRepresentedFilename(documentPath ?? "");
    window.setTitle(windowTitle());
  });

  ipcMain.on(IPC.saveResult, (_event, saved: unknown) => {
    pendingSaveAck?.(Boolean(saved));
    pendingSaveAck = undefined;
  });
}

function windowTitle(): string {
  const document = documentPath ? basename(documentPath) : undefined;
  // macOS shows unsaved state through the close button and proxy icon; other
  // platforms only have the title bar.
  const marker = documentEdited && process.platform !== "darwin" ? "\u2022 " : "";
  return `${marker}${[document, app.getName()].filter(Boolean).join(" - ")}`;
}

function senderWindow(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): BrowserWindow | null {
  const window = BrowserWindow.fromWebContents(event.sender);
  // Only the top frame of a window we created may drive the file system.
  return window && event.senderFrame === event.sender.mainFrame ? window : null;
}

async function confirmClose(window: BrowserWindow): Promise<void> {
  const { response } = await dialog.showMessageBox(window, {
    type: "question",
    title: "Unsaved changes",
    message: "Save changes before closing?",
    detail: "Your family tree has changes that have not been written to disk.",
    buttons: ["Save", "Discard", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });

  if (response === 2) return;
  if (response === 0 && !(await requestRendererSave(window))) return;

  closeConfirmed = true;
  window.close();
}

/** Asks the renderer to run its save flow and waits for the acknowledgement. */
function requestRendererSave(window: BrowserWindow): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingSaveAck = undefined;
      resolve(false);
    }, SAVE_ACK_TIMEOUT_MS);
    pendingSaveAck = (saved) => {
      clearTimeout(timer);
      resolve(saved);
    };
    window.webContents.send(IPC.menuAction, "save-project" satisfies MenuAction);
  });
}

async function deliverFile(filePath: string): Promise<void> {
  const window = mainWindow ?? BrowserWindow.getAllWindows()[0];
  if (!window) {
    queuedFilePath = filePath;
    return;
  }
  try {
    const contents = await readFile(filePath, "utf8");
    window.webContents.send(IPC.openedFile, { filePath, contents } satisfies OpenedProjectFile);
    focusMainWindow();
  } catch (error) {
    await dialog.showMessageBox(window, {
      type: "error",
      title: "Could not open project",
      message: `${basename(filePath)} could not be read.`,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

function focusMainWindow(): void {
  const window = mainWindow ?? BrowserWindow.getAllWindows()[0];
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.focus();
}

function send(action: MenuAction): void {
  mainWindow?.webContents.send(IPC.menuAction, action);
}

/** `.ftree` path from an argv vector, ignoring Electron/Chromium switches. */
function fileArgument(argv: string[]): string | undefined {
  return argv.slice(1).find((argument) => !argument.startsWith("-") && argument.toLowerCase().endsWith(`.${PROJECT_EXTENSION}`));
}

function buildMenu(): Menu {
  const isMac = process.platform === "darwin";
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: "appMenu" as const }] : []),
    {
      label: "File",
      submenu: [
        { label: "New Project", accelerator: "CmdOrCtrl+N", click: () => send("new-project") },
        { label: "Open Project...", accelerator: "CmdOrCtrl+O", click: () => send("open-project") },
        { type: "separator" },
        { label: "Save", accelerator: "CmdOrCtrl+S", click: () => send("save-project") },
        { label: "Save As...", accelerator: "CmdOrCtrl+Shift+S", click: () => send("save-project-as") },
        { type: "separator" },
        {
          label: "Export",
          submenu: [
            { label: "As PDF", accelerator: "CmdOrCtrl+E", click: () => send("export-pdf") },
            { label: "As PNG Image", click: () => send("export-png") },
            { label: "As SVG Image", click: () => send("export-svg") },
          ],
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Tree", accelerator: "CmdOrCtrl+1", click: () => send("view-tree") },
        { label: "Timeline", accelerator: "CmdOrCtrl+2", click: () => send("view-timeline") },
        { type: "separator" },
        { label: "Toggle Theme", accelerator: "CmdOrCtrl+Shift+L", click: () => send("toggle-theme") },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { role: "toggleDevTools" },
      ],
    },
    {
      label: "Family",
      submenu: [{ label: "Add Person", accelerator: "CmdOrCtrl+Shift+N", click: () => send("add-person") }],
    },
    { role: "windowMenu" },
  ];
  return Menu.buildFromTemplate(template);
}
