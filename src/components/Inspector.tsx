import { useCallback, useMemo, useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { type TranslationKey, useI18n } from "../i18n";
import { desktop, hasDesktopBridge } from "../lib/desktop";
import { ageLabel, peopleById, personName, relatedPeople, relationshipLabel } from "../lib/family";
import { useFamilyStore } from "../store/familyStore";
import type { Gender, Person, RelationshipKind } from "../types";

interface InspectorProps {
  onStatus: (message: string) => void;
}

export function Inspector({ onStatus }: InspectorProps) {
  const { familyText, t } = useI18n();
  const addPerson = useFamilyStore((state) => state.addPerson);
  const addRelationship = useFamilyStore((state) => state.addRelationship);
  const project = useFamilyStore((state) => state.project);
  const removePerson = useFamilyStore((state) => state.removePerson);
  const removeRelationship = useFamilyStore((state) => state.removeRelationship);
  const selectedPersonId = useFamilyStore((state) => state.selectedPersonId);
  const selectPerson = useFamilyStore((state) => state.selectPerson);
  const updatePerson = useFamilyStore((state) => state.updatePerson);
  const [relationshipError, setRelationshipError] = useState("");
  /**
   * Holds the id of the person whose death fields the user opened manually.
   * Scoping it to an id means selecting somebody else resets it for free, and
   * clearing a death date mid-edit no longer disables the field underneath.
   */
  const [deceasedOverrideId, setDeceasedOverrideId] = useState<string>();
  const selectedPerson = project.people.find((person) => person.id === selectedPersonId);

  const confirmAction = useCallback(
    async (titleKey: TranslationKey, messageKey: TranslationKey) => {
      if (!hasDesktopBridge()) return window.confirm(t(messageKey));
      return desktop().confirm({ title: t(titleKey), message: t(messageKey), confirmLabel: t("delete"), cancelLabel: t("cancel") });
    },
    [t],
  );

  // One lookup table serves every relationship row instead of rebuilding a map
  // of all people per row.
  const directory = useMemo(() => peopleById(project.people), [project.people]);
  const related = useMemo(
    () => (selectedPersonId ? relatedPeople(directory, project.relationships, selectedPersonId) : { parents: [], spouses: [], children: [] }),
    [directory, project.relationships, selectedPersonId],
  );
  const personRelationships = useMemo(
    () => project.relationships.filter((relationship) => relationship.from === selectedPersonId || relationship.to === selectedPersonId),
    [project.relationships, selectedPersonId],
  );
  const selectablePeople = useMemo(
    () => project.people.filter((person) => person.id !== selectedPersonId),
    [project.people, selectedPersonId],
  );

  if (!selectedPerson) {
    return (
      <aside className="inspector">
        <section className="panel-section empty-state">
          <div>
            <p>{t("selectPersonHelp")}</p>
            <button className="text-button primary-button" onClick={() => addPerson()} type="button">
              <UserPlus size={16} />
              {t("addPerson")}
            </button>
          </div>
        </section>
      </aside>
    );
  }

  const activePerson = selectedPerson;
  const isDeceased = Boolean(activePerson.deathDate) || deceasedOverrideId === activePerson.id;

  function patchPerson(patch: Partial<Person>) {
    updatePerson(activePerson.id, patch);
  }

  function link(type: RelationshipKind, from: string, to: string) {
    const result = addRelationship({ type, from, to });
    setRelationshipError(result.ok ? "" : t(result.reason as TranslationKey));
  }

  function setAlive(isAlive: boolean) {
    setDeceasedOverrideId(isAlive ? undefined : activePerson.id);
    if (isAlive) patchPerson({ deathDate: "", deathPlace: "" });
  }

  async function confirmRemovePerson() {
    if (await confirmAction("deletePersonConfirmTitle", "deletePersonConfirmMessage")) {
      removePerson(activePerson.id);
      onStatus(t("deletePerson"));
    }
  }

  async function confirmRemoveRelationship(relationshipId: string) {
    if (await confirmAction("deleteRelationshipConfirmTitle", "deleteRelationshipConfirmMessage")) {
      removeRelationship(relationshipId);
    }
  }

  return (
    <aside className="inspector">
      <section className="panel-section">
        <div className="panel-title-row">
          <div>
            <h2 className="panel-title">{personName(activePerson, familyText)}</h2>
            <span className="muted-text">{ageLabel(activePerson, familyText)}</span>
          </div>
          <button className="icon-button danger-button" onClick={() => void confirmRemovePerson()} title={t("deletePerson")} type="button">
            <Trash2 size={17} />
          </button>
        </div>

        <div className="field-stack">
          <div className="field-grid">
            <label className="field-label">{t("firstName")}<input onChange={(event) => patchPerson({ firstName: event.currentTarget.value })} value={activePerson.firstName} /></label>
            <label className="field-label">{t("lastName")}<input onChange={(event) => patchPerson({ lastName: event.currentTarget.value })} value={activePerson.lastName} /></label>
          </div>
          <div className="field-grid">
            <label className="field-label">
              {t("gender")}
              <select onChange={(event) => patchPerson({ gender: event.currentTarget.value as Gender })} value={activePerson.gender}>
                <option value="female">{t("female")}</option>
                <option value="male">{t("male")}</option>
              </select>
            </label>
            <label className="field-label">{t("occupation")}<input onChange={(event) => patchPerson({ occupation: event.currentTarget.value })} value={activePerson.occupation ?? ""} /></label>
          </div>
          <div className="field-grid">
            <label className="field-label">{t("birthDate")}<input max={activePerson.deathDate || undefined} onChange={(event) => patchPerson({ birthDate: event.currentTarget.value })} type="date" value={activePerson.birthDate ?? ""} /></label>
            <label className="field-label">{t("deathDate")}<input disabled={!isDeceased} min={activePerson.birthDate || undefined} onChange={(event) => patchPerson({ deathDate: event.currentTarget.value })} type="date" value={activePerson.deathDate ?? ""} /></label>
          </div>
          <label className="checkbox-row">
            <input checked={!isDeceased} onChange={(event) => setAlive(event.currentTarget.checked)} type="checkbox" />
            {t("stillAlive")}
          </label>
          <div className="field-grid">
            <label className="field-label">{t("birthPlace")}<input onChange={(event) => patchPerson({ birthPlace: event.currentTarget.value })} value={activePerson.birthPlace ?? ""} /></label>
            <label className="field-label">{t("deathPlace")}<input disabled={!isDeceased} onChange={(event) => patchPerson({ deathPlace: event.currentTarget.value })} value={activePerson.deathPlace ?? ""} /></label>
          </div>
          <label className="field-label">{t("photoUrl")}<input onChange={(event) => patchPerson({ photoUrl: event.currentTarget.value })} placeholder="https://" value={activePerson.photoUrl ?? ""} /></label>
          <label className="field-label">{t("tags")}<input onChange={(event) => patchPerson({ tags: splitTags(event.currentTarget.value) })} value={activePerson.tags.join(", ")} /></label>
          <label className="field-label">{t("notes")}<textarea onChange={(event) => patchPerson({ notes: event.currentTarget.value })} value={activePerson.notes ?? ""} /></label>
        </div>
      </section>

      <section className="panel-section">
        <h2 className="panel-title">{t("relationships")}</h2>
        <div className="field-stack">
          <RelationshipPicker label={t("addFather")} onPick={(parentId) => link("parent-child", parentId, activePerson.id)} people={selectablePeople.filter((person) => person.gender === "male")} />
          <RelationshipPicker label={t("addMother")} onPick={(parentId) => link("parent-child", parentId, activePerson.id)} people={selectablePeople.filter((person) => person.gender === "female")} />
          <RelationshipPicker label={t("addChild")} onPick={(childId) => link("parent-child", activePerson.id, childId)} people={selectablePeople} />
          <RelationshipPicker label={t("addSpouse")} onPick={(spouseId) => link("spouse", activePerson.id, spouseId)} people={selectablePeople.filter((person) => person.gender !== activePerson.gender)} />
          {relationshipError ? <p className="form-error">{relationshipError}</p> : null}
        </div>
      </section>

      <section className="panel-section">
        <div className="relationship-list">
          {[...related.parents, ...related.spouses, ...related.children].map((person) => (
            <button className="list-row interactive" key={person.id} onClick={() => selectPerson(person.id)} type="button">
              <strong>{personName(person, familyText)}</strong>
              <span className="muted-text">{t("openProfile")}</span>
            </button>
          ))}
          {personRelationships.map((relationship) => (
            <div className="list-row relationship-row" key={relationship.id}>
              <span>{relationshipLabel(directory, relationship, familyText)}</span>
              <button className="icon-button danger-button" onClick={() => void confirmRemoveRelationship(relationship.id)} title={t("removeRelationship")} type="button">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

interface RelationshipPickerProps {
  label: string;
  onPick: (personId: string) => void;
  people: Person[];
}

function RelationshipPicker({ label, onPick, people }: RelationshipPickerProps) {
  const { familyText, t } = useI18n();
  return (
    <label className="field-label">
      {label}
      <select
        disabled={people.length === 0}
        onChange={(event) => {
          const personId = event.currentTarget.value;
          event.currentTarget.value = "";
          if (personId) onPick(personId);
        }}
        value=""
      >
        <option value="">{t("choosePerson")}</option>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {personName(person, familyText)}
          </option>
        ))}
      </select>
    </label>
  );
}

function splitTags(value: string): string[] {
  return value.split(",").map((tag) => tag.trim()).filter(Boolean);
}
