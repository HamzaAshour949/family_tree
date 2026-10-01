import { useEffect, useMemo, useRef, useState } from "react";
import { Heart, Plus, Trash2, UserPlus, X } from "lucide-react";
import { contentDirection, type TranslationKey, useI18n } from "../i18n";
import { ageLabel, peopleById, personName, yearFromDate } from "../lib/family";
import { confirmAction } from "../lib/confirm";
import { useFamilyStore, type RelativeKind } from "../store/familyStore";
import type { Gender, Person, Relationship, RelationshipKind } from "../types";

interface InspectorProps {
  onStatus: (message: string) => void;
}

interface RelatedEntry {
  relationship: Relationship;
  person: Person;
}

export function Inspector({ onStatus }: InspectorProps) {
  const { familyText, t } = useI18n();
  const addPerson = useFamilyStore((state) => state.addPerson);
  const addRelationship = useFamilyStore((state) => state.addRelationship);
  const addRelative = useFamilyStore((state) => state.addRelative);
  const changeGender = useFamilyStore((state) => state.changeGender);
  const newPersonId = useFamilyStore((state) => state.newPersonId);
  const project = useFamilyStore((state) => state.project);
  const removePerson = useFamilyStore((state) => state.removePerson);
  const removeRelationship = useFamilyStore((state) => state.removeRelationship);
  const selectedPersonId = useFamilyStore((state) => state.selectedPersonId);
  const selectPerson = useFamilyStore((state) => state.selectPerson);
  const updatePerson = useFamilyStore((state) => state.updatePerson);
  const updateRelationship = useFamilyStore((state) => state.updateRelationship);
  const [message, setMessage] = useState("");
  const firstNameRef = useRef<HTMLInputElement>(null);
  /**
   * Holds the id of the person whose death fields the user opened manually.
   * Scoping it to an id means selecting somebody else resets it for free, and
   * clearing a death date mid-edit no longer disables the field underneath.
   */
  const [deceasedOverrideId, setDeceasedOverrideId] = useState<string>();
  const selectedPerson = project.people.find((person) => person.id === selectedPersonId);

  // An error about one person must not linger on the next.
  useEffect(() => setMessage(""), [selectedPersonId]);

  // A person who has just been created is about to be named.
  useEffect(() => {
    if (newPersonId && newPersonId === selectedPersonId) {
      firstNameRef.current?.focus();
      firstNameRef.current?.select();
    }
  }, [newPersonId, selectedPersonId]);

  // One lookup table serves every row instead of rebuilding a map per row.
  const directory = useMemo(() => peopleById(project.people), [project.people]);
  const groups = useMemo(() => {
    const parents: RelatedEntry[] = [];
    const spouses: RelatedEntry[] = [];
    const children: RelatedEntry[] = [];
    for (const relationship of project.relationships) {
      if (relationship.from !== selectedPersonId && relationship.to !== selectedPersonId) continue;
      const otherId = relationship.from === selectedPersonId ? relationship.to : relationship.from;
      const person = directory.get(otherId);
      if (!person) continue;
      if (relationship.type === "spouse") spouses.push({ relationship, person });
      else if (relationship.to === selectedPersonId) parents.push({ relationship, person });
      else children.push({ relationship, person });
    }
    children.sort((first, second) => (yearFromDate(first.person.birthDate) ?? Infinity) - (yearFromDate(second.person.birthDate) ?? Infinity));
    return { parents, spouses, children };
  }, [directory, project.relationships, selectedPersonId]);
  const selectablePeople = useMemo(() => project.people.filter((person) => person.id !== selectedPersonId), [project.people, selectedPersonId]);
  // A person has at most one father and one mother, so those offers go once filled.
  const hasFather = groups.parents.some((entry) => entry.person.gender === "male");
  const hasMother = groups.parents.some((entry) => entry.person.gender === "female");

  if (!selectedPerson) {
    return (
      <aside className="inspector empty">
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

  function patchPerson(patch: Parameters<typeof updatePerson>[1]) {
    updatePerson(activePerson.id, patch);
  }

  function chooseGender(gender: Gender) {
    const result = changeGender(activePerson.id, gender);
    setMessage(result.ok ? "" : `${t("cannotChangeGender")} ${t(result.reason as TranslationKey)}`);
  }

  function link(type: RelationshipKind, from: string, to: string) {
    const result = addRelationship({ type, from, to });
    setMessage(result.ok ? "" : t(result.reason as TranslationKey));
  }

  function quickAdd(kind: RelativeKind) {
    const result = addRelative(activePerson.id, kind);
    setMessage(result.ok ? "" : t(result.reason as TranslationKey));
  }

  function setAlive(isAlive: boolean) {
    setDeceasedOverrideId(isAlive ? undefined : activePerson.id);
    if (isAlive) patchPerson({ deathDate: "", deathPlace: "" });
  }

  async function confirmRemovePerson() {
    const confirmed = await confirmAction({
      title: t("deletePersonConfirmTitle"),
      message: t("deletePersonConfirmMessage"),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
    });
    if (!confirmed) return;
    removePerson(activePerson.id);
    onStatus(t("personDeleted"));
  }

  async function confirmRemoveRelationship(relationshipId: string) {
    const confirmed = await confirmAction({
      title: t("deleteRelationshipConfirmTitle"),
      message: t("deleteRelationshipConfirmMessage"),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
    });
    if (confirmed) removeRelationship(relationshipId);
  }

  const spouseWord = activePerson.gender === "male" ? t("addWife") : t("addHusband");

  return (
    <aside className="inspector">
      <section className="panel-section">
        <div className="panel-title-row">
          <div className="panel-heading">
            <h2 className="panel-title">{personName(activePerson, familyText)}</h2>
            <span className="muted-text">{ageLabel(activePerson, familyText)}</span>
          </div>
          <div className="button-row">
            <button className="icon-button danger-button" aria-label={t("deletePerson")} onClick={() => void confirmRemovePerson()} title={t("deletePerson")} type="button">
              <Trash2 size={17} />
            </button>
            <button className="icon-button drawer-close" aria-label={t("closePanel")} onClick={() => selectPerson(undefined)} title={t("closePanel")} type="button">
              <X size={17} />
            </button>
          </div>
        </div>

        <div className="field-stack">
          <div className="field-grid">
            <label className="field-label">{t("firstName")}<input dir={contentDirection(activePerson.firstName)} onChange={(event) => patchPerson({ firstName: event.currentTarget.value })} ref={firstNameRef} value={activePerson.firstName} /></label>
            <label className="field-label">{t("lastName")}<input dir={contentDirection(activePerson.lastName)} onChange={(event) => patchPerson({ lastName: event.currentTarget.value })} value={activePerson.lastName} /></label>
          </div>
          <div className="field-grid">
            <label className="field-label">
              {t("gender")}
              <select onChange={(event) => chooseGender(event.currentTarget.value as Gender)} value={activePerson.gender}>
                <option value="female">{t("female")}</option>
                <option value="male">{t("male")}</option>
              </select>
            </label>
            <label className="field-label">{t("occupation")}<input dir={contentDirection(activePerson.occupation)} onChange={(event) => patchPerson({ occupation: event.currentTarget.value })} value={activePerson.occupation ?? ""} /></label>
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
            <label className="field-label">{t("birthPlace")}<input dir={contentDirection(activePerson.birthPlace)} onChange={(event) => patchPerson({ birthPlace: event.currentTarget.value })} value={activePerson.birthPlace ?? ""} /></label>
            <label className="field-label">{t("deathPlace")}<input dir={contentDirection(activePerson.deathPlace)} disabled={!isDeceased} onChange={(event) => patchPerson({ deathPlace: event.currentTarget.value })} value={activePerson.deathPlace ?? ""} /></label>
          </div>
          <label className="field-label">{t("photoUrl")}<input dir="ltr" inputMode="url" onChange={(event) => patchPerson({ photoUrl: event.currentTarget.value })} placeholder="https://" value={activePerson.photoUrl ?? ""} /></label>
          <label className="field-label">{t("tags")}<input dir={contentDirection(activePerson.tags.join(", "))} onChange={(event) => patchPerson({ tags: splitTags(event.currentTarget.value) })} value={activePerson.tags.join(", ")} /></label>
          <label className="field-label">{t("notes")}<textarea dir={contentDirection(activePerson.notes)} onChange={(event) => patchPerson({ notes: event.currentTarget.value })} value={activePerson.notes ?? ""} /></label>
        </div>
      </section>

      <section className="panel-section">
        <h2 className="panel-title">{t("relationships")}</h2>
        <div className="quick-add">
          {hasFather ? null : <button className="text-button" onClick={() => quickAdd("father")} type="button"><Plus size={14} />{t("addFather")}</button>}
          {hasMother ? null : <button className="text-button" onClick={() => quickAdd("mother")} type="button"><Plus size={14} />{t("addMother")}</button>}
          <button className="text-button" onClick={() => quickAdd("son")} type="button"><Plus size={14} />{t("addSon")}</button>
          <button className="text-button" onClick={() => quickAdd("daughter")} type="button"><Plus size={14} />{t("addDaughter")}</button>
          <button className="text-button" onClick={() => quickAdd("spouse")} type="button"><Heart size={14} />{spouseWord}</button>
        </div>
        {message ? <p className="form-error" role="alert">{message}</p> : null}

        <details className="link-existing">
          <summary>{t("linkExisting")}</summary>
          <div className="field-stack">
            {hasFather ? null : <RelationshipPicker label={t("addFather")} onPick={(parentId) => link("parent-child", parentId, activePerson.id)} people={selectablePeople.filter((person) => person.gender === "male")} />}
            {hasMother ? null : <RelationshipPicker label={t("addMother")} onPick={(parentId) => link("parent-child", parentId, activePerson.id)} people={selectablePeople.filter((person) => person.gender === "female")} />}
            <RelationshipPicker label={t("addChild")} onPick={(childId) => link("parent-child", activePerson.id, childId)} people={selectablePeople} />
            <RelationshipPicker label={t("addSpouse")} onPick={(spouseId) => link("spouse", activePerson.id, spouseId)} people={selectablePeople.filter((person) => person.gender !== activePerson.gender)} />
          </div>
        </details>
      </section>

      <section className="panel-section">
        <RelatedGroup entries={groups.parents} onRemove={(id) => void confirmRemoveRelationship(id)} title={t("parents")} />
        <RelatedGroup
          entries={groups.spouses}
          onDate={(relationshipId, date) => updateRelationship(relationshipId, { date })}
          onRemove={(id) => void confirmRemoveRelationship(id)}
          title={t("spouses")}
        />
        <RelatedGroup entries={groups.children} onRemove={(id) => void confirmRemoveRelationship(id)} title={t("children")} />
        {groups.parents.length + groups.spouses.length + groups.children.length === 0 ? <p className="muted-text">{t("noRelationships")}</p> : null}
      </section>
    </aside>
  );
}

interface RelatedGroupProps {
  entries: RelatedEntry[];
  onDate?: (relationshipId: string, date: string) => void;
  onRemove: (relationshipId: string) => void;
  title: string;
}

/**
 * Module-level on purpose: declared inside `Inspector` it would be a new
 * component type on every render, remounting its inputs and dropping focus
 * on each keystroke in the marriage date field.
 */
function RelatedGroup({ entries, onDate, onRemove, title }: RelatedGroupProps) {
  const { familyText, t } = useI18n();
  const selectPerson = useFamilyStore((state) => state.selectPerson);
  if (entries.length === 0) return null;
  return (
    <div className="related-group">
      <h3 className="group-title">{title}</h3>
      <div className="relationship-list">
        {entries.map(({ person, relationship }) => (
          <div className="related-row" key={relationship.id}>
            <button className="related-name" onClick={() => selectPerson(person.id)} title={t("openProfile")} type="button">
              <strong>{personName(person, familyText)}</strong>
              <span className="muted-text">{person.birthDate ? String(yearFromDate(person.birthDate) ?? "") : ""}</span>
            </button>
            <button className="icon-button danger-button small" aria-label={t("removeRelationship")} onClick={() => onRemove(relationship.id)} title={t("removeRelationship")} type="button">
              <Trash2 size={14} />
            </button>
            {onDate ? (
              <label className="related-date">
                {t("marriageDate")}
                <input onChange={(event) => onDate(relationship.id, event.currentTarget.value)} type="date" value={relationship.date ?? ""} />
              </label>
            ) : null}
          </div>
        ))}
      </div>
    </div>
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
