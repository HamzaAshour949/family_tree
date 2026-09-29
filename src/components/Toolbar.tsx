import { Download, FolderOpen, Moon, Plus, Redo2, Save, SaveAll, Search, Sun, Undo2, UsersRound } from "lucide-react";
import { forwardRef } from "react";
import { useI18n } from "../i18n";
import type { ExportFormat } from "../lib/exporters";
import { useFamilyStore } from "../store/familyStore";
import type { Gender, LanguageCode } from "../types";

interface ToolbarProps {
  onExport: (format: ExportFormat) => void;
  onNew: () => void;
  onOpen: () => void;
  onRedo: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onUndo: () => void;
}

export const Toolbar = forwardRef<HTMLInputElement, ToolbarProps>(function Toolbar({ onExport, onNew, onOpen, onRedo, onSave, onSaveAs, onUndo }, searchRef) {
  const { language, languageOptions, setLanguage, t } = useI18n();
  const activeView = useFamilyStore((state) => state.activeView);
  const canRedo = useFamilyStore((state) => state.future.length > 0);
  const canUndo = useFamilyStore((state) => state.past.length > 0);
  const genderFilter = useFamilyStore((state) => state.genderFilter);
  const isDirty = useFamilyStore((state) => state.isDirty);
  const projectName = useFamilyStore((state) => state.project.name);
  const searchQuery = useFamilyStore((state) => state.searchQuery);
  const setActiveView = useFamilyStore((state) => state.setActiveView);
  const setGenderFilter = useFamilyStore((state) => state.setGenderFilter);
  const setSearchQuery = useFamilyStore((state) => state.setSearchQuery);
  const theme = useFamilyStore((state) => state.theme);
  const toggleTheme = useFamilyStore((state) => state.toggleTheme);

  return (
    <header className="app-topbar">
      <div className="topbar-start">
        <div className="brand-lockup">
          <div className="brand-mark">
            <UsersRound size={20} />
          </div>
          <div className="brand-text">
            <h1 className="brand-title">{t("appTitle")}</h1>
            <p className="brand-subtitle" title={projectName}>
              <span className="brand-project">{projectName}</span>
              {isDirty ? <span className="dirty-dot" title={t("unsavedChanges")} role="img" aria-label={t("unsavedChanges")} /> : null}
            </p>
          </div>
        </div>

        <div className="toolbar-group">
          <button className="icon-button" aria-label={t("newProject")} onClick={onNew} title={t("newProject")} type="button">
            <Plus size={18} />
          </button>
          <button className="icon-button" aria-label={t("openProject")} onClick={onOpen} title={t("openProject")} type="button">
            <FolderOpen size={18} />
          </button>
          <button className="icon-button" aria-label={t("saveProject")} onClick={onSave} title={t("saveProject")} type="button">
            <Save size={18} />
          </button>
          <button className="icon-button" aria-label={t("saveProjectAs")} onClick={onSaveAs} title={t("saveProjectAs")} type="button">
            <SaveAll size={18} />
          </button>
          <span className="toolbar-divider" aria-hidden="true" />
          <button className="icon-button" aria-label={t("undo")} disabled={!canUndo} onClick={onUndo} title={t("undo")} type="button">
            <Undo2 size={18} />
          </button>
          <button className="icon-button" aria-label={t("redo")} disabled={!canRedo} onClick={onRedo} title={t("redo")} type="button">
            <Redo2 size={18} />
          </button>
          <span className="toolbar-divider" aria-hidden="true" />
          <label className="export-select-shell" title={t("export")}>
            <Download size={16} />
            <select
              aria-label={t("export")}
              onChange={(event) => {
                const format = event.currentTarget.value;
                event.currentTarget.value = "";
                if (format) onExport(format as ExportFormat);
              }}
              value=""
            >
              <option value="">{t("export")}</option>
              <option value="pdf">{t("exportAsPdf")}</option>
              <option value="png">{t("exportAsPng")}</option>
              <option value="svg">{t("exportAsSvg")}</option>
            </select>
          </label>
        </div>

        <div className="view-tabs" role="tablist">
          <button aria-selected={activeView === "tree"} className={`segmented-button ${activeView === "tree" ? "active" : ""}`} onClick={() => setActiveView("tree")} role="tab" type="button">
            {t("tree")}
          </button>
          <button aria-selected={activeView === "timeline"} className={`segmented-button ${activeView === "timeline" ? "active" : ""}`} onClick={() => setActiveView("timeline")} role="tab" type="button">
            {t("timeline")}
          </button>
        </div>
      </div>

      <div className="topbar-actions">
        <div className="search-shell">
          <Search size={15} />
          <input aria-label={t("searchPeople")} className="search-input" onChange={(event) => setSearchQuery(event.currentTarget.value)} placeholder={t("searchPeople")} ref={searchRef} type="search" value={searchQuery} />
        </div>
        <select aria-label={t("gender")} className="compact-select" onChange={(event) => setGenderFilter(event.currentTarget.value as Gender | "all")} value={genderFilter}>
          <option value="all">{t("all")}</option>
          <option value="female">{t("female")}</option>
          <option value="male">{t("male")}</option>
        </select>
        <select aria-label={t("language")} className="compact-select language-select" onChange={(event) => setLanguage(event.currentTarget.value as LanguageCode)} value={language}>
          {languageOptions.map((option) => (
            <option key={option.code} value={option.code}>
              {option.nativeLabel}
            </option>
          ))}
        </select>
        <button className="icon-button" aria-label={t("toggleTheme")} onClick={toggleTheme} title={t("toggleTheme")} type="button">
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
});
