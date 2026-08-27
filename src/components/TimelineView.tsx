import { CalendarDays } from "lucide-react";
import { useI18n } from "../i18n";
import { personName, timelineEvents } from "../lib/family";
import { useFamilyStore } from "../store/familyStore";

export function TimelineView() {
  const { familyText, t } = useI18n();
  const project = useFamilyStore((state) => state.project);
  const selectPerson = useFamilyStore((state) => state.selectPerson);
  const setActiveView = useFamilyStore((state) => state.setActiveView);
  const peopleById = new Map(project.people.map((person) => [person.id, person]));
  const events = timelineEvents(project, familyText);
  const lastEvent = events[events.length - 1];

  return (
    <section className="timeline-shell">
      <div className="timeline-header">
        <div>
          <h2 className="timeline-title">{t("timeline")}</h2>
          <p className="muted-text">{events.length} {t("datedEventsAcross")} {project.people.length} {t("peopleLower")}</p>
        </div>
        <span className="status-chip"><CalendarDays size={14} />{events[0]?.year ?? t("noDates")} {events.length > 1 ? `${t("to")} ${lastEvent?.year}` : ""}</span>
      </div>

      <div className="timeline-list">
        {events.map((event) => {
          const person = event.personId ? peopleById.get(event.personId) : undefined;
          return (
            <button className="timeline-event list-row interactive" key={event.id} onClick={() => { if (event.personId) { selectPerson(event.personId); setActiveView("tree"); } }} type="button">
              <span className="timeline-year">{event.year}</span>
              <span><strong>{event.title}</strong><span className="muted-text">{event.detail}</span></span>
              <span className="status-chip">{person ? personName(person, familyText) : event.kind}</span>
            </button>
          );
        })}
        {events.length === 0 ? <div className="empty-state">{t("addDatesTimeline")}</div> : null}
      </div>
    </section>
  );
}