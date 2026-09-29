import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Inspector } from "./components/Inspector";
import { ProjectPanel } from "./components/ProjectPanel";
import { TimelineView } from "./components/TimelineView";
import { Toolbar } from "./components/Toolbar";
import { TreeCanvas } from "./components/TreeCanvas";
import { useI18n, type TranslationKey } from "./i18n";
import { confirmAction } from "./lib/confirm";
import { hasDesktopBridge, desktop, type MenuAction, type OpenedProjectFile } from "./lib/desktop";
import { exportTreeElement, type ExportFormat } from "./lib/exporters";
import { isEditableTarget } from "./lib/keyboard";
import { parseProject } from "./lib/projectFile";
import { openProjectFile, saveProjectFile } from "./lib/projectIO";
import { loadSampleProject } from "./lib/sample";
import { shellStringsByLanguage } from "./messages";
import { useFamilyStore } from "./store/familyStore";

const TOAST_DURATION_MS = 3600;

const EXPORT_SUCCESS: Record<ExportFormat, TranslationKey> = { pdf: "pdfExported", png: "pngExported", svg: "svgExported" };
const EXPORT_FAILURE: Record<ExportFormat, TranslationKey> = { pdf: "couldNotExportPdf", png: "couldNotExportPng", svg: "couldNotExportSvg" };

function App() {
  const { direction, language, t } = useI18n();
  const activeView = useFamilyStore((state) => state.activeView);
  const addPerson = useFamilyStore((state) => state.addPerson);
  const createProject = useFamilyStore((state) => state.createProject);
  const filePath = useFamilyStore((state) => state.filePath);
  const isDirty = useFamilyStore((state) => state.isDirty);
  const loadProject = useFamilyStore((state) => state.loadProject);
  const markSaved = useFamilyStore((state) => state.markSaved);
  const projectName = useFamilyStore((state) => state.project.name);
  const redo = useFamilyStore((state) => state.redo);
  const selectPerson = useFamilyStore((state) => state.selectPerson);
  const selectedPersonId = useFamilyStore((state) => state.selectedPersonId);
  const setActiveView = useFamilyStore((state) => state.setActiveView);
  const theme = useFamilyStore((state) => state.theme);
  const toggleTheme = useFamilyStore((state) => state.toggleTheme);
  const undo = useFamilyStore((state) => state.undo);
  const exportRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<string>();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
    document.documentElement.dataset.language = language;
    document.title = t("appTitle");
  }, [direction, language, t]);

  // Lets the stylesheet make room for macOS window controls.
  useEffect(() => {
    document.documentElement.dataset.platform = hasDesktopBridge() ? desktop().platform : "web";
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(undefined), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Keeps the native title bar, the macOS dot and the close guard in sync.
  useEffect(() => {
    if (!hasDesktopBridge()) return;
    desktop().setDocumentState({ dirty: isDirty, filePath, name: projectName });
  }, [filePath, isDirty, projectName]);

  // Native menus and the close dialog follow the interface language.
  useEffect(() => {
    if (!hasDesktopBridge()) return;
    desktop().setShellStrings(shellStringsByLanguage[language]);
  }, [language]);

  /**
   * Replacing the open project throws away anything unsaved, so every path
   * that does so asks first. Reading the flag from the store rather than a
   * captured value keeps this correct without re-creating the callbacks.
   */
  const confirmDiscard = useCallback(async () => {
    if (!useFamilyStore.getState().isDirty) return true;
    return confirmAction({
      title: t("discardChangesTitle"),
      message: t("discardChangesMessage"),
      confirmLabel: t("discard"),
      cancelLabel: t("cancel"),
    });
  }, [t]);

  const handleNew = useCallback(async () => {
    if (await confirmDiscard()) createProject();
  }, [confirmDiscard, createProject]);

  const handleOpen = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    try {
      const opened = await openProjectFile();
      if (!opened) return;
      loadProject(opened.project, opened.filePath);
      setToast(t("projectLoaded"));
    } catch (error) {
      setToast(errorMessage(error, t("couldNotOpenProject")));
    }
  }, [confirmDiscard, loadProject, t]);

  const handleOpenSample = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    try {
      loadProject(loadSampleProject());
      setToast(t("projectLoaded"));
    } catch (error) {
      setToast(errorMessage(error, t("couldNotOpenSample")));
    }
  }, [confirmDiscard, loadProject, t]);

  /**
   * `Save` reuses the current path; `Save As` always prompts. The result is
   * reported back to the main process so the close-confirmation dialog knows
   * whether it may proceed.
   */
  const handleSave = useCallback(
    async ({ promptForPath = false } = {}) => {
      const { project, filePath: currentPath } = useFamilyStore.getState();
      let saved = false;
      try {
        const savedPath = await saveProjectFile(project, promptForPath ? undefined : currentPath);
        if (savedPath) {
          // Edits made while the write was in flight are not on disk, so what
          // counts as saved is the project that was written, not the current one.
          markSaved(savedPath, project);
          setToast(t("projectSaved"));
          saved = true;
        }
      } catch (error) {
        setToast(errorMessage(error, t("couldNotSaveProject")));
      }
      if (hasDesktopBridge()) desktop().reportSaveResult(saved);
      return saved;
    },
    [markSaved, t],
  );

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      // Exporting always captures the tree, so switch to it first and give
      // React a chance to mount the canvas before reading the ref.
      setActiveView("tree");
      setToast(t("preparingExport"));
      const surface = await waitForElement(exportRef);
      if (!surface) {
        setToast(t("treeSurfaceNotReady"));
        return;
      }
      try {
        const exportedPath = await exportTreeElement(surface, useFamilyStore.getState().project.name, format);
        setToast(exportedPath ? t(EXPORT_SUCCESS[format]) : undefined);
      } catch (error) {
        setToast(errorMessage(error, t(EXPORT_FAILURE[format])));
      }
    },
    [setActiveView, t],
  );

  /**
   * The keyboard and the menu are ambiguous: while a text field has focus,
   * undo and redo belong to that field, and anywhere else they step through
   * edits to the family tree. The toolbar buttons are explicit, so they always
   * act on the tree.
   */
  const handleUndo = useCallback(() => {
    if (isEditableTarget(document.activeElement)) document.execCommand("undo");
    else undo();
  }, [undo]);

  const handleRedo = useCallback(() => {
    if (isEditableTarget(document.activeElement)) document.execCommand("redo");
    else redo();
  }, [redo]);

  const handleDeleteSelected = useCallback(async () => {
    const personId = useFamilyStore.getState().selectedPersonId;
    if (!personId) return;
    const confirmed = await confirmAction({
      title: t("deletePersonConfirmTitle"),
      message: t("deletePersonConfirmMessage"),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
    });
    if (!confirmed) return;
    useFamilyStore.getState().removePerson(personId);
    setToast(t("personDeleted"));
  }, [t]);

  // Native menu items and their accelerators drive the same handlers as the
  // toolbar buttons, so there is a single implementation of each action.
  useEffect(() => {
    if (!hasDesktopBridge()) return undefined;
    const actions: Record<MenuAction, () => void> = {
      "new-project": () => void handleNew(),
      "open-project": () => void handleOpen(),
      "save-project": () => void handleSave(),
      "save-project-as": () => void handleSave({ promptForPath: true }),
      "export-pdf": () => void handleExport("pdf"),
      "export-png": () => void handleExport("png"),
      "export-svg": () => void handleExport("svg"),
      undo: handleUndo,
      redo: handleRedo,
      "add-person": () => addPerson(),
      "view-timeline": () => setActiveView("timeline"),
      "view-tree": () => setActiveView("tree"),
      "toggle-theme": toggleTheme,
    };
    return desktop().onMenuAction((action) => actions[action]?.());
  }, [addPerson, handleExport, handleNew, handleOpen, handleRedo, handleSave, handleUndo, setActiveView, toggleTheme]);

  // Projects opened by double-clicking a `.ftree` file or passed on the CLI.
  useEffect(() => {
    if (!hasDesktopBridge()) return undefined;

    const accept = async (file: OpenedProjectFile) => {
      if (!(await confirmDiscard())) return;
      try {
        loadProject(parseProject(file.contents), file.filePath);
        setToast(t("projectLoaded"));
      } catch (error) {
        setToast(errorMessage(error, t("couldNotOpenProject")));
      }
    };

    // A file named at launch is waiting in the main process rather than being
    // pushed, because this listener does not exist until the app has mounted.
    void desktop()
      .takePendingFile()
      .then((pending) => (pending ? accept(pending) : undefined))
      .catch(() => undefined);

    return desktop().onOpenFile((file) => void accept(file));
  }, [confirmDiscard, loadProject, t]);

  // Shortcuts the native menu does not own.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (modifier && !event.shiftKey && !event.altKey && key === "f") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      // Without the desktop shell there is no menu to own undo and redo.
      if (modifier && !hasDesktopBridge() && !isEditableTarget(event.target) && (key === "z" || key === "y")) {
        event.preventDefault();
        if (key === "y" || event.shiftKey) redo();
        else undo();
        return;
      }
      if (isEditableTarget(event.target)) return;
      if ((event.key === "Delete" || event.key === "Backspace") && selectedPersonId && useFamilyStore.getState().activeView === "tree") {
        event.preventDefault();
        void handleDeleteSelected();
      } else if (event.key === "Escape") {
        selectPerson(undefined);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleDeleteSelected, redo, selectPerson, selectedPersonId, undo]);

  return (
    <div className="app-shell">
      <Toolbar
        onExport={(format) => void handleExport(format)}
        onNew={() => void handleNew()}
        onOpen={() => void handleOpen()}
        onRedo={redo}
        onSave={() => void handleSave()}
        onSaveAs={() => void handleSave({ promptForPath: true })}
        onUndo={undo}
        ref={searchRef}
      />
      <div className={`workspace-grid ${selectedPersonId ? "has-selection" : ""}`}>
        <div className="sidebar">
          <ProjectPanel />
        </div>
        {activeView === "tree" ? (
          <TreeCanvas exportRef={exportRef} onOpen={() => void handleOpen()} onOpenSample={() => void handleOpenSample()} onStatus={setToast} />
        ) : (
          <TimelineView />
        )}
        <Inspector onStatus={setToast} />
      </div>
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

/** Waits a few frames for a conditionally rendered element to attach. */
async function waitForElement(ref: RefObject<HTMLElement | null>, maxFrames = 30): Promise<HTMLElement | null> {
  for (let frame = 0; frame < maxFrames; frame += 1) {
    if (ref.current) return ref.current;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return ref.current;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default App;
