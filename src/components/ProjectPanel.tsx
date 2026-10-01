import { useMemo } from "react";
import { CalendarClock, Network, Plus, UsersRound } from "lucide-react";
import { contentDirection, useI18n } from "../i18n";
import { timelineEvents } from "../lib/family";
import { useFamilyStore } from "../store/familyStore";

export function ProjectPanel() {
  const { familyText, t } = useI18n();
  const addPerson = useFamilyStore((state) => state.addPerson);
  const project = useFamilyStore((state) => state.project);
  const updateProjectMeta = useFamilyStore((state) => state.updateProjectMeta);
  const eventCount = useMemo(() => timelineEvents(project, familyText).length, [familyText, project]);

  return (
    <>
      <section className="panel-section">
        <div className="panel-title-row">
          <h2 className="panel-title">{t("project")}</h2>
          <button className="icon-button primary-button" onClick={() => addPerson()} title={t("addPerson")} type="button">
            <Plus size={17} />
          </button>
        </div>
        <div className="field-stack">
          <label className="field-label">
            {t("name")}
            <input dir={contentDirection(project.name)} onChange={(event) => updateProjectMeta({ name: event.currentTarget.value })} value={project.name} />
          </label>
          <label className="field-label">
            {t("description")}
            <textarea dir={contentDirection(project.description)} onChange={(event) => updateProjectMeta({ description: event.currentTarget.value })} value={project.description} />
          </label>
        </div>
      </section>

      <section className="panel-section">
        <div className="metric-grid">
          <div className="metric-tile">
            <UsersRound size={16} />
            <span className="metric-value">{project.people.length}</span>
            <span className="metric-label">{t("people")}</span>
          </div>
          <div className="metric-tile">
            <Network size={16} />
            <span className="metric-value">{project.relationships.length}</span>
            <span className="metric-label">{t("links")}</span>
          </div>
          <div className="metric-tile">
            <CalendarClock size={16} />
            <span className="metric-value">{eventCount}</span>
            <span className="metric-label">{t("events")}</span>
          </div>
        </div>
      </section>
    </>
  );
}
