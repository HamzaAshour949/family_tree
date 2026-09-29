import { useMemo } from "react";
import { CalendarDays } from "lucide-react";
import { type TranslationKey, useI18n } from "../i18n";
import { peopleById, personName, timelineEvents } from "../lib/family";
import { useFamilyStore } from "../store/familyStore";
import type { TimelineEvent } from "../types";

const KIND_LABEL: Record<TimelineEvent["kind"], TranslationKey> = {
  birth: "eventBirth",
  death: "eventDeath",
  marriage: "eventMarriage",
};

export function TimelineView() {
  const { familyText, t } = useI18n();
  const project = useFamilyStore((state) => state.project);
  const selectPerson = useFamilyStore((state) => state.selectPerson);
  const setActiveView = useFamilyStore((state) => state.setActiveView);

  const directory = useMemo(() => peopleById(project.people), [project.people]);
  const events = useMemo(() => timelineEvents(project, familyText), [familyText, project]);
  const firstYear = events[0]?.year;
  const lastYear = events[events.length - 1]?.year;

  function openPerson(personId?: string) {
    if (!personId) return;
    selectPerson(personId);
    setActiveView("tree");
  }

  return (
    <section className="timeline-shell">
      <div className="timeline-header">
        <div>
          <h2 className="timeline-title">{t("timeline")}</h2>
          <p className="muted-text">
            {events.length} {t("datedEventsAcross")} {project.people.length} {t("peopleLower")}
          </p>
        </div>
        <span className="status-chip">
          <CalendarDays size={14} />
          {firstYear ?? t("noDates")}
          {events.length > 1 && lastYear !== firstYear ? ` ${t("to")} ${lastYear}` : ""}
        </span>
      </div>

      <div className="timeline-list">
        {events.map((event) => {
          const person = event.personId ? directory.get(event.personId) : undefined;
          return (
            <button
              className="timeline-event list-row interactive"
              disabled={!event.personId}
              key={event.id}
              onClick={() => openPerson(event.personId)}
              type="button"
            >
              <span className="timeline-year">{event.year}</span>
              <span>
                <strong>{event.title}</strong>
                <span className="muted-text">{event.detail}</span>
              </span>
              <span className="status-chip">{person ? personName(person, familyText) : t(KIND_LABEL[event.kind])}</span>
            </button>
          );
        })}
        {events.length === 0 ? <div className="empty-state">{t("addDatesTimeline")}</div> : null}
      </div>
    </section>
  );
}
