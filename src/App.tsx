import { useEffect, useRef, useState } from "react";
import { ActivationGate, FullVersionGate } from "./components/ActivationGate";
import { Inspector } from "./components/Inspector";
import { ProjectPanel } from "./components/ProjectPanel";
import { TimelineView } from "./components/TimelineView";
import { Toolbar } from "./components/Toolbar";
import { TreeCanvas } from "./components/TreeCanvas";
import { useI18n } from "./i18n";
import { exportTreeElement, type ExportFormat } from "./lib/exporters";
import { loadLicenseSnapshot, verifyLicense } from "./lib/license";
import { openProjectFile, saveProjectFile } from "./lib/projectIO";
import { useFamilyStore } from "./store/familyStore";

const PUBLIC_SHELL_BUILD = import.meta.env.VITE_PUBLIC_SHELL === "true";

function App() {
  const { direction, language, t } = useI18n();
  const activeView = useFamilyStore((state) => state.activeView);
  const createProject = useFamilyStore((state) => state.createProject);
  const license = useFamilyStore((state) => state.license);
  const loadProject = useFamilyStore((state) => state.loadProject);
  const project = useFamilyStore((state) => state.project);
  const setLicense = useFamilyStore((state) => state.setLicense);
  const theme = useFamilyStore((state) => state.theme);
  const exportRef = useRef<HTMLDivElement>(null);
  const [licenseLoaded, setLicenseLoaded] = useState(false);
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
    const timer = window.setTimeout(() => setToast(undefined), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    loadLicenseSnapshot()
      .then(setLicense)
      .finally(() => setLicenseLoaded(true));
  }, [setLicense]);

  useEffect(() => {
    if (!license.serialKey) {
      return;
    }
    const lastVerified = license.lastVerifiedAt ? new Date(license.lastVerifiedAt).getTime() : 0;
    const oneDay = 24 * 60 * 60 * 1000;
    if (Date.now() - lastVerified > oneDay) {
      verifyLicense(license).then(setLicense).catch(() => undefined);
    }
  }, [license, setLicense]);

  async function handleOpen() {
    try {
      const opened = await openProjectFile();
      if (opened) {
        loadProject(opened);
        setToast(t("projectLoaded"));
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : t("couldNotOpenProject"));
    }
  }

  async function handleSave() {
    try {
      const savedPath = await saveProjectFile(project);
      if (savedPath) {
        setToast(t("projectSaved"));
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : t("couldNotSaveProject"));
    }
  }

  async function handleExport(format: ExportFormat) {
    if (!exportRef.current) {
      setToast(t("treeSurfaceNotReady"));
      return;
    }
    try {
      const exportedPath = await exportTreeElement(exportRef.current, project.name, format);
      if (exportedPath) {
        setToast(format === "png" ? t("pngExported") : format === "svg" ? t("svgExported") : t("pdfExported"));
      }
    } catch (error) {
      const fallback = format === "png" ? t("couldNotExportPng") : format === "svg" ? t("couldNotExportSvg") : t("couldNotExportPdf");
      setToast(error instanceof Error ? error.message : fallback);
    }
  }

  const licenseIsActive = license.tier === "full" && license.status === "active";

  if (!licenseLoaded) {
    return <div className="app-shell loading-shell"><div className="empty-state">{t("loading")}</div></div>;
  }

  if (!licenseIsActive) {
    return <><ActivationGate downloadAfterActivation={PUBLIC_SHELL_BUILD} onStatus={setToast} />{toast ? <div className="toast">{toast}</div> : null}</>;
  }

  if (PUBLIC_SHELL_BUILD) {
    return <><FullVersionGate onStatus={setToast} />{toast ? <div className="toast">{toast}</div> : null}</>;
  }

  return (
    <div className="app-shell">
      <Toolbar onExport={(format) => void handleExport(format)} onNew={createProject} onOpen={() => void handleOpen()} onSave={() => void handleSave()} />
      <div className="workspace-grid">
        <div className="sidebar">
          <ProjectPanel />
        </div>
        {activeView === "tree" ? <TreeCanvas exportRef={exportRef} onStatus={setToast} /> : <TimelineView />}
        <Inspector />
      </div>
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

export default App;