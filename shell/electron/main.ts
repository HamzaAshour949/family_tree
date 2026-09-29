import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell, type FileFilter, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_SHELL_STRINGS,
  IPC,
  PROJECT_EXTENSION,
  type DesktopPlatform,
  type ExportFormat,
  type MenuAction,
  type OpenedProjectFile,
  type ShellStrings,
} from "../../shared/desktop";
import { projectPathFromArgv } from "../core/launch";
import { buildMenuModel } from "../core/menuModel";
import { FileGrants, readProjectFile, safeSuggestedName, withExtension, writeFileAtomic } from "../core/projectFiles";
import { DocumentSession } from "../core/session";
import { windowTitle } from "../core/title";
import { parseConfirmRequest, parseDocumentState, parseExportRequest, parseSaveProjectRequest, parseShellStrings } from "../core/validation";
import { loadWindowState, MIN_WINDOW_SIZE, saveWindowState } from "../core/windowState";
import { toElectronMenu } from "./menu";

const PROJECT_FILTERS: FileFilter[] = [{ name: "Family Tree Project", extensions: [PROJECT_EXTENSION] }];
const EXPORT_FILTERS: Record<ExportFormat, FileFilter[]> = {
  pdf: [{ name: "PDF Document", extensions: ["pdf"] }],
  png: [{ name: "PNG Image", extensions: ["png"] }],
  svg: [{ name: "SVG Image", extensions: ["svg"] }],
};
const SAVE_ACK_TIMEOUT_MS = 60_000;
const WINDOW_STATE_SAVE_DELAY_MS = 400;
const RENDERER_RELOAD_COOLDOWN_MS = 10_000;

const platform: DesktopPlatform = process.platform === "darwin" || process.platform === "win32" ? process.platform : "linux";
const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const rendererRoot = join(__dirname, "..", "dist");
const rendererRootUrl = `${pathToFileURL(rendererRoot).toString()}/`;

const documentSession = new DocumentSession();
const grants = new FileGrants();
let shellStrings: ShellStrings = DEFAULT_SHELL_STRINGS;
let mainWindow: BrowserWindow | undefined;
let pendingSaveAck: ((saved: boolean) => void) | undefined;
let closePromptOpen = false;
/** Set by `before-quit`, so that finishing the close prompt carries on to quit the app. */
let quitting = false;
let lastRendererCrash = 0;

// The renderer is sandboxed by the window's own `sandbox: true` (and Electron's
// default). Deliberately no `app.enableSandbox()`: it overrides `--no-sandbox`,
// which electron-builder's AppImage launcher adds on its own where user
// namespaces are unavailable - forcing the sandbox there would crash the app
// at startup instead of letting it run.

const launchFile = projectPathFromArgv(process.argv, process.cwd());
if (launchFile) {
  grants.grant(launchFile);
  documentSession.queueFile(launchFile);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void bootstrap();
}

async function bootstrap(): Promise<void> {
  // Launching again (a double-click on a .ftree, or the command line) hands the
  // request to the running instance. Its relative paths mean the directory the
  // second process was started in, not ours.
  app.on("second-instance", (_event, argv, workingDirectory) => {
    const requested = projectPathFromArgv(argv, workingDirectory);
    if (requested) {
      grants.grant(requested);
      void deliverFile(requested);
    }
    focusMainWindow();
  });

  // macOS delivers "open with" and Dock drops here rather than through argv.
  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    grants.grant(filePath);
    if (mainWindow) {
      void deliverFile(filePath);
      return;
    }
    documentSession.queueFile(filePath);
    if (app.isReady()) void createMainWindow();
  });

  app.on("before-quit", () => {
    quitting = true;
  });

  app.on("window-all-closed", () => {
    if (platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createMainWindow();
    else focusMainWindow();
  });

  registerIpcHandlers();
  await app.whenReady();
  lockDownSession();
  applyMenu();
  await createMainWindow();
}

async function createMainWindow(): Promise<void> {
  if (mainWindow) return;
  const statePath = join(app.getPath("userData"), "window-state.json");
  const saved = loadWindowState(statePath);

  const window = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    show: false,
    backgroundColor: "#101214",
    title: app.getName(),
    // The app's own toolbar sits under the traffic lights and doubles as the drag region.
    titleBarStyle: platform === "darwin" ? "hiddenInset" : "default",
    icon: app.isPackaged || platform === "darwin" ? undefined : join(__dirname, "..", "build", "icon.png"),
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
  if (saved.maximized) window.maximize();
  window.once("ready-to-show", () => window.show());
  trackWindowState(window, statePath);

  window.on("closed", () => {
    if (mainWindow === window) mainWindow = undefined;
    // The app can outlive its window on macOS; the next window must start clean.
    documentSession.reset();
  });
  window.on("close", (event) => {
    if (!documentSession.needsClosePrompt()) return;
    event.preventDefault();
    void confirmClose(window);
  });
  // The title reflects the document, not whatever the page's <title> says.
  window.webContents.on("page-title-updated", (event) => event.preventDefault());

  hardenNavigation(window);
  recoverFromRendererCrash(window);

  // A preload failure would otherwise be silent, leaving the renderer with no
  // file access and no indication why.
  window.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(`[preload] ${preloadPath} failed to load:`, error);
  });

  try {
    if (devServerUrl) {
      await window.loadURL(devServerUrl);
      window.webContents.openDevTools({ mode: "detach" });
    } else {
      await window.loadFile(join(rendererRoot, "index.html"));
    }
  } catch (error) {
    // A window that never finishes loading would stay hidden forever.
    console.error("[startup] the interface failed to load:", error);
    dialog.showErrorBox(app.getName(), `The interface could not be loaded.\n\n${error instanceof Error ? error.message : String(error)}`);
    app.quit();
  }
}

/** Remembers the window's size between launches. */
function trackWindowState(window: BrowserWindow, statePath: string): void {
  let timer: NodeJS.Timeout | undefined;
  const persist = () => {
    if (window.isDestroyed() || window.isMinimized() || window.isFullScreen()) return;
    // The normal bounds are reported even while maximised, so a maximised
    // window still remembers the size it will restore to.
    const { width, height } = window.getNormalBounds();
    saveWindowState(statePath, { width, height, maximized: window.isMaximized() });
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(persist, WINDOW_STATE_SAVE_DELAY_MS);
  };
  window.on("resize", schedule);
  window.on("maximize", schedule);
  window.on("unmaximize", schedule);
  window.on("close", () => {
    clearTimeout(timer);
    persist();
  });
}

/**
 * The renderer only ever renders local content. Anything trying to navigate
 * elsewhere - or open a window - is handed to the system browser instead.
 */
function hardenNavigation(window: BrowserWindow): void {
  const guard = (event: { preventDefault: () => void }, target: string) => {
    if (isTrustedUrl(target)) return;
    event.preventDefault();
    void openExternal(target);
  };

  window.webContents.on("will-navigate", guard);
  window.webContents.on("will-redirect", guard);
  window.webContents.setWindowOpenHandler(({ url }) => {
    void openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
}

/** A renderer that dies would leave a blank window; reload it, but never in a tight loop. */
function recoverFromRendererCrash(window: BrowserWindow): void {
  window.webContents.on("render-process-gone", (_event, details) => {
    console.error("[renderer] process gone:", details.reason);
    const now = Date.now();
    if (details.reason === "clean-exit" || now - lastRendererCrash < RENDERER_RELOAD_COOLDOWN_MS) return;
    lastRendererCrash = now;
    window.webContents.reload();
  });
}

/**
 * Keeps the session from doing anything on its own account.
 *
 * The app needs no camera, microphone, notifications or location, so nothing is
 * granted. The spellchecker is switched off for the whole session, not just the
 * window: left on, Chromium downloads a dictionary from Google on every launch,
 * a network request the app never asked for.
 */
function lockDownSession(): void {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setSpellCheckerEnabled(false);
  // The dictionary is fetched per configured language, so an empty list is what
  // actually stops the download.
  session.defaultSession.setSpellCheckerLanguages([]);
}

function isTrustedUrl(target: string): boolean {
  if (devServerUrl && target.startsWith(devServerUrl)) return true;
  return target.startsWith(rendererRootUrl);
}

async function openExternal(target: string): Promise<void> {
  try {
    const { protocol } = new URL(target);
    if (protocol === "https:" || protocol === "mailto:") await shell.openExternal(target);
  } catch {
    // Not a URL at all; nothing to open.
  }
}

/** Only the top frame of our own window, showing our own page, may drive the file system. */
function senderWindow(event: IpcMainInvokeEvent | IpcMainEvent): BrowserWindow | null {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window !== mainWindow) return null;
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) return null;
  return isTrustedUrl(frame.url) ? window : null;
}

function requireWindow(event: IpcMainInvokeEvent | IpcMainEvent): BrowserWindow {
  const window = senderWindow(event);
  if (!window) throw new Error("This request did not come from the application window.");
  return window;
}

function registerIpcHandlers(): void {
  // Claimed by the renderer once it has mounted. A file named on the command
  // line cannot simply be pushed: the window finishes loading before React has
  // subscribed, so the message would arrive with nobody listening.
  ipcMain.handle(IPC.takePendingFile, async (event): Promise<OpenedProjectFile | null> => {
    const window = requireWindow(event);
    const filePath = documentSession.takeQueuedFile();
    return filePath ? readForRenderer(window, filePath) : null;
  });

  ipcMain.handle(IPC.openProject, async (event): Promise<OpenedProjectFile | null> => {
    const window = requireWindow(event);
    const result = await dialog.showOpenDialog(window, { properties: ["openFile"], filters: PROJECT_FILTERS, defaultPath: app.getPath("documents") });
    const [filePath] = result.filePaths;
    if (result.canceled || !filePath) return null;
    grants.grant(filePath);
    const contents = await readProjectFile(filePath);
    app.addRecentDocument(filePath);
    return { filePath, contents };
  });

  ipcMain.handle(IPC.saveProject, async (event, payload: unknown): Promise<string | null> => {
    const window = requireWindow(event);
    const request = parseSaveProjectRequest(payload);

    // "Save" reuses the current file, but only one the user actually chose.
    let filePath = request.filePath && grants.has(request.filePath) ? request.filePath : undefined;
    if (!filePath) {
      const name = safeSuggestedName(request.suggestedName, "family-tree");
      filePath = await chooseSavePath(window, join(app.getPath("documents"), `${name}.${PROJECT_EXTENSION}`), PROJECT_FILTERS, PROJECT_EXTENSION);
      if (!filePath) return null;
      grants.grant(filePath);
    }
    await writeFileAtomic(filePath, request.contents);
    app.addRecentDocument(filePath);
    return filePath;
  });

  ipcMain.handle(IPC.exportFile, async (event, payload: unknown): Promise<string | null> => {
    const window = requireWindow(event);
    const request = parseExportRequest(payload);
    const name = safeSuggestedName(request.suggestedName, "family-tree");
    const filePath = await chooseSavePath(window, join(app.getPath("documents"), `${name}.${request.format}`), EXPORT_FILTERS[request.format], request.format);
    if (!filePath) return null;
    await writeFileAtomic(filePath, typeof request.data === "string" ? request.data : Buffer.from(request.data));
    return filePath;
  });

  ipcMain.handle(IPC.confirm, async (event, payload: unknown): Promise<boolean> => {
    const window = requireWindow(event);
    const request = parseConfirmRequest(payload);
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

  ipcMain.on(IPC.setDocumentState, (event, payload: unknown) => {
    const window = senderWindow(event);
    if (!window) return;
    try {
      const state = parseDocumentState(payload);
      documentSession.update(state);
      window.setDocumentEdited(state.dirty);
      window.setRepresentedFilename(state.filePath ?? "");
      window.setTitle(windowTitle(app.getName(), state, platform));
    } catch (error) {
      console.error("[ipc] ignored a malformed document state:", error);
    }
  });

  ipcMain.on(IPC.setShellStrings, (event, payload: unknown) => {
    if (!senderWindow(event)) return;
    const next = parseShellStrings(payload, DEFAULT_SHELL_STRINGS);
    if (JSON.stringify(next) === JSON.stringify(shellStrings)) return;
    shellStrings = next;
    applyMenu();
  });

  ipcMain.on(IPC.saveResult, (event, saved: unknown) => {
    if (!senderWindow(event)) return;
    pendingSaveAck?.(saved === true);
    pendingSaveAck = undefined;
  });
}

/**
 * Asks where to save, adding the extension if the platform's dialog did not.
 * If adding it lands on a file that already exists, the dialog is shown again
 * with the full name so the operating system's own overwrite prompt applies -
 * otherwise "tree" would silently replace an existing "tree.ftree".
 */
async function chooseSavePath(window: BrowserWindow, defaultPath: string, filters: FileFilter[], extension: string): Promise<string | undefined> {
  let suggestion = defaultPath;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await dialog.showSaveDialog(window, { defaultPath: suggestion, filters });
    if (result.canceled || !result.filePath) return undefined;
    const completed = withExtension(result.filePath, extension);
    if (completed === result.filePath || !(await exists(completed))) return completed;
    suggestion = completed;
  }
  return undefined;
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

/** Reads a project for the renderer, telling the user - in their language - when that fails. */
async function readForRenderer(window: BrowserWindow, filePath: string): Promise<OpenedProjectFile | null> {
  try {
    const contents = await readProjectFile(filePath);
    app.addRecentDocument(filePath);
    return { filePath, contents };
  } catch (error) {
    await dialog.showMessageBox(window, {
      type: "error",
      title: shellStrings.openFailedTitle,
      message: shellStrings.openFailedMessage.replace("{name}", fileLabel(filePath)),
      detail: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function fileLabel(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

async function deliverFile(filePath: string): Promise<void> {
  const window = mainWindow;
  if (!window) {
    documentSession.queueFile(filePath);
    return;
  }
  const file = await readForRenderer(window, filePath);
  if (!file) return;
  window.webContents.send(IPC.openedFile, file satisfies OpenedProjectFile);
  focusMainWindow();
}

async function confirmClose(window: BrowserWindow): Promise<void> {
  if (closePromptOpen) return;
  closePromptOpen = true;
  try {
    const { response } = await dialog.showMessageBox(window, {
      type: "question",
      title: shellStrings.closeTitle,
      message: shellStrings.closeMessage,
      detail: shellStrings.closeDetail,
      buttons: [shellStrings.closeSave, shellStrings.closeDiscard, shellStrings.closeCancel],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });

    if (response === 2 || (response === 0 && !(await requestRendererSave(window)))) {
      // Staying open also cancels a quit that was waiting on this window.
      quitting = false;
      return;
    }
    documentSession.approveClose();
    window.close();
    if (quitting) app.quit();
  } finally {
    closePromptOpen = false;
  }
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

function focusMainWindow(): void {
  const window = mainWindow;
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.focus();
}

function send(action: MenuAction): void {
  mainWindow?.webContents.send(IPC.menuAction, action);
}

function applyMenu(): void {
  const model = buildMenuModel(shellStrings, { platform, devTools: !app.isPackaged });
  Menu.setApplicationMenu(toElectronMenu(model, send));
}
