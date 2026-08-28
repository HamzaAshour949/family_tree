import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Inspector } from "./components/Inspector";
import { ProjectPanel } from "./components/ProjectPanel";
import { TimelineView } from "./components/TimelineView";
import { Toolbar } from "./components/Toolbar";
import { TreeCanvas } from "./components/TreeCanvas";
import { useI18n, type TranslationKey } from "./i18n";
import { hasDesktopBridge, desktop, type MenuAction } from "./lib/desktop";
import { exportTreeElement, type ExportFormat } from "./lib/exporters";
import { openProjectFile, parseProject, saveProjectFile } from "./lib/projectIO";
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
  const setActiveView = useFamilyStore((state) => state.setActiveView);
  const theme = useFamilyStore((state) => state.theme);
  const toggleTheme = useFamilyStore((state) => state.toggleTheme);
  const exportRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<string>();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
    document.documentElement.dataset.language = language;
  }, [direction, language]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(undefined), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Keeps the native title bar, the macOS dot and the close guard in sync.
  useEffect(() => {
    if (!hasDesktopBridge()) return;
    desktop().setDocumentEdited(isDirty, filePath);
  }, [filePath, isDirty]);

  const handleOpen = useCallback(async () => {
    try {
      const opened = await openProjectFile();
      if (!opened) return;
      loadProject(opened.project, opened.filePath);
      setToast(t("projectLoaded"));
    } catch (error) {
      setToast(errorMessage(error, t("couldNotOpenProject")));
    }
  }, [loadProject, t]);

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
          markSaved(savedPath);
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

  // Native menu items and their accelerators drive the same handlers as the
  // toolbar buttons, so there is a single implementation of each action.
  useEffect(() => {
    if (!hasDesktopBridge()) return undefined;
    const actions: Record<MenuAction, () => void> = {
      "new-project": createProject,
      "open-project": () => void handleOpen(),
      "save-project": () => void handleSave(),
      "save-project-as": () => void handleSave({ promptForPath: true }),
      "export-pdf": () => void handleExport("pdf"),
      "export-png": () => void handleExport("png"),
      "export-svg": () => void handleExport("svg"),
      "add-person": () => addPerson(),
      "view-timeline": () => setActiveView("timeline"),
      "view-tree": () => setActiveView("tree"),
      "toggle-theme": toggleTheme,
    };
    return desktop().onMenuAction((action) => actions[action]?.());
  }, [addPerson, createProject, handleExport, handleOpen, handleSave, setActiveView, toggleTheme]);

  // Projects opened by double-clicking a `.ftree` file or passed on the CLI.
  useEffect(() => {
    if (!hasDesktopBridge()) return undefined;
    return desktop().onOpenFile((file) => {
      try {
        loadProject(parseProject(file.contents), file.filePath);
        setToast(t("projectLoaded"));
      } catch (error) {
        setToast(errorMessage(error, t("couldNotOpenProject")));
      }
    });
  }, [loadProject, t]);

  return (
    <div className="app-shell">
      <Toolbar
        onExport={(format) => void handleExport(format)}
        onNew={createProject}
        onOpen={() => void handleOpen()}
        onSave={() => void handleSave()}
        onSaveAs={() => void handleSave({ promptForPath: true })}
      />
      <div className="workspace-grid">
        <div className="sidebar">
          <ProjectPanel />
        </div>
        {activeView === "tree" ? <TreeCanvas exportRef={exportRef} onStatus={setToast} /> : <TimelineView />}
        <Inspector onStatus={setToast} />
      </div>
      {toast ? <div className="toast">{toast}</div> : null}
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
