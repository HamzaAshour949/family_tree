import { Download, FileJson, FolderOpen, Moon, Plus, Search, Sun, UsersRound } from "lucide-react";
import { useI18n } from "../i18n";
import type { ExportFormat } from "../lib/exporters";
import { useFamilyStore } from "../store/familyStore";
import type { Gender, LanguageCode } from "../types";

interface ToolbarProps {
  onExport: (format: ExportFormat) => void;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
}

export function Toolbar({ onExport, onNew, onOpen, onSave }: ToolbarProps) {
  const { language, languageOptions, licenseText, setLanguage, t } = useI18n();
  const activeView = useFamilyStore((state) => state.activeView);
  const genderFilter = useFamilyStore((state) => state.genderFilter);
  const license = useFamilyStore((state) => state.license);
  const project = useFamilyStore((state) => state.project);
  const searchQuery = useFamilyStore((state) => state.searchQuery);
  const setActiveView = useFamilyStore((state) => state.setActiveView);
  const setGenderFilter = useFamilyStore((state) => state.setGenderFilter);
  const setSearchQuery = useFamilyStore((state) => state.setSearchQuery);
  const setTheme = useFamilyStore((state) => state.setTheme);
  const theme = useFamilyStore((state) => state.theme);

  return (
    <header className="app-topbar">
      <div className="brand-lockup">
        <div className="brand-mark">
          <UsersRound size={20} />
        </div>
        <div>
          <h1 className="brand-title">{t("appTitle")}</h1>
          <p className="brand-subtitle">{project.name}</p>
        </div>
      </div>

      <div className="toolbar-group">
        <button className="icon-button" onClick={onNew} title={t("newProject")} type="button">
          <Plus size={18} />
        </button>
        <button className="icon-button" onClick={onOpen} title={t("openProject")} type="button">
          <FolderOpen size={18} />
        </button>
        <button className="icon-button" onClick={onSave} title={t("saveProject")} type="button">
          <FileJson size={18} />
        </button>
        <label className="export-select-shell" title={t("export")}> 
          <Download size={16} />
          <select aria-label={t("export")} onChange={(event) => { if (event.currentTarget.value) onExport(event.currentTarget.value as ExportFormat); event.currentTarget.value = ""; }} value="">
            <option value="">{t("export")}</option>
            <option value="pdf">{t("exportAsPdf")}</option>
            <option value="png">{t("exportAsPng")}</option>
            <option value="svg">{t("exportAsSvg")}</option>
          </select>
        </label>
        <div className="view-tabs">
          <button className={`segmented-button ${activeView === "tree" ? "active" : ""}`} onClick={() => setActiveView("tree")} type="button">
            {t("tree")}
          </button>
          <button className={`segmented-button ${activeView === "timeline" ? "active" : ""}`} onClick={() => setActiveView("timeline")} type="button">
            {t("timeline")}
          </button>
        </div>
      </div>

      <div className="topbar-actions">
        <div className="search-shell">
          <Search size={15} />
          <input className="search-input" onChange={(event) => setSearchQuery(event.currentTarget.value)} placeholder={t("searchPeople")} value={searchQuery} />
        </div>
        <select className="search-input" onChange={(event) => setGenderFilter(event.currentTarget.value as Gender | "all")} value={genderFilter}>
          <option value="all">{t("all")}</option>
          <option value="female">{t("female")}</option>
          <option value="male">{t("male")}</option>
        </select>
        <div className="language-shell">
          <select className="language-select" aria-label={t("language")} onChange={(event) => setLanguage(event.currentTarget.value as LanguageCode)} value={language}>
            {languageOptions.map((option) => <option key={option.code} value={option.code}>{option.nativeLabel}</option>)}
          </select>
        </div>
        <span className={`status-chip ${license.tier}`}>{licenseText(license)}</span>
        <button className="icon-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title={t("toggleTheme")} type="button">
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}