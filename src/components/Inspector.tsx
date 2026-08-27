import { confirm } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { type TranslationKey, useI18n } from "../i18n";
import { ageLabel, personName, relatedPeople, relationshipLabel } from "../lib/family";
import { useFamilyStore } from "../store/familyStore";
import type { Gender, Person, RelationshipKind } from "../types";

export function Inspector() {
  const { familyText, t } = useI18n();
  const addPerson = useFamilyStore((state) => state.addPerson);
  const addRelationship = useFamilyStore((state) => state.addRelationship);
  const project = useFamilyStore((state) => state.project);
  const removePerson = useFamilyStore((state) => state.removePerson);
  const removeRelationship = useFamilyStore((state) => state.removeRelationship);
  const selectedPersonId = useFamilyStore((state) => state.selectedPersonId);
  const selectPerson = useFamilyStore((state) => state.selectPerson);
  const updatePerson = useFamilyStore((state) => state.updatePerson);
  const [deathFieldsEnabled, setDeathFieldsEnabled] = useState(false);
  const [relationshipError, setRelationshipError] = useState("");
  const selectedPerson = project.people.find((person) => person.id === selectedPersonId);

  useEffect(() => {
    setDeathFieldsEnabled(Boolean(selectedPerson?.deathDate));
  }, [selectedPerson?.id, selectedPerson?.deathDate]);

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
  const related = relatedPeople(project, activePerson.id);
  const selectablePeople = project.people.filter((person) => person.id !== activePerson.id);

  function patchPerson(patch: Partial<Person>) {
    updatePerson(activePerson.id, patch);
  }

  function createRelation(type: RelationshipKind, targetId: string) {
    if (!targetId) return;
    const result = addRelationship({ type, from: activePerson.id, to: targetId });
    setRelationshipError(result.ok ? "" : t(result.reason as TranslationKey));
  }

  function createParent(parentId: string) {
    if (!parentId) return;
    const result = addRelationship({ type: "parent-child", from: parentId, to: activePerson.id });
    setRelationshipError(result.ok ? "" : t(result.reason as TranslationKey));
  }

  function clearDeathDateIfAlive(isAlive: boolean) {
    if (isAlive) {
      setDeathFieldsEnabled(false);
      patchPerson({ deathDate: "", deathPlace: "" });
    } else {
      setDeathFieldsEnabled(true);
    }
  }

  async function confirmRemovePerson() {
    const shouldDelete = await confirm(t("deletePersonConfirmMessage"), { title: t("deletePersonConfirmTitle"), kind: "warning" });
    if (shouldDelete) removePerson(activePerson.id);
  }

  async function confirmRemoveRelationship(relationshipId: string) {
    const shouldDelete = await confirm(t("deleteRelationshipConfirmMessage"), { title: t("deleteRelationshipConfirmTitle"), kind: "warning" });
    if (shouldDelete) removeRelationship(relationshipId);
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
            <label className="field-label">{t("gender")}<select onChange={(event) => patchPerson({ gender: event.currentTarget.value as Gender })} value={activePerson.gender}><option value="female">{t("female")}</option><option value="male">{t("male")}</option></select></label>
            <label className="field-label">{t("occupation")}<input onChange={(event) => patchPerson({ occupation: event.currentTarget.value })} value={activePerson.occupation ?? ""} /></label>
          </div>
          <div className="field-grid">
            <label className="field-label">{t("birthDate")}<input onChange={(event) => patchPerson({ birthDate: event.currentTarget.value })} type="date" value={activePerson.birthDate ?? ""} /></label>
            <label className="field-label">{t("deathDate")}<input disabled={!deathFieldsEnabled} onChange={(event) => patchPerson({ deathDate: event.currentTarget.value })} type="date" value={activePerson.deathDate ?? ""} /></label>
          </div>
          <label className="checkbox-row"><input checked={!deathFieldsEnabled && !activePerson.deathDate} onChange={(event) => clearDeathDateIfAlive(event.currentTarget.checked)} type="checkbox" />{t("stillAlive")}</label>
          <div className="field-grid">
            <label className="field-label">{t("birthPlace")}<input onChange={(event) => patchPerson({ birthPlace: event.currentTarget.value })} value={activePerson.birthPlace ?? ""} /></label>
            <label className="field-label">{t("deathPlace")}<input disabled={!deathFieldsEnabled} onChange={(event) => patchPerson({ deathPlace: event.currentTarget.value })} value={activePerson.deathPlace ?? ""} /></label>
          </div>
          <label className="field-label">{t("photoUrl")}<input onChange={(event) => patchPerson({ photoUrl: event.currentTarget.value })} value={activePerson.photoUrl ?? ""} /></label>
          <label className="field-label">{t("tags")}<input onChange={(event) => patchPerson({ tags: splitTags(event.currentTarget.value) })} value={activePerson.tags.join(", ")} /></label>
          <label className="field-label">{t("notes")}<textarea onChange={(event) => patchPerson({ notes: event.currentTarget.value })} value={activePerson.notes ?? ""} /></label>
        </div>
      </section>

      <section className="panel-section">
        <h2 className="panel-title">{t("relationships")}</h2>
        <div className="field-stack">
          <RelationshipPicker label={t("addFather")} onPick={createParent} people={selectablePeople.filter((person) => person.gender === "male")} />
          <RelationshipPicker label={t("addMother")} onPick={createParent} people={selectablePeople.filter((person) => person.gender === "female")} />
          <RelationshipPicker label={t("addChild")} onPick={(personId) => createRelation("parent-child", personId)} people={selectablePeople} />
          <RelationshipPicker label={t("addSpouse")} onPick={(personId) => createRelation("spouse", personId)} people={selectablePeople} />
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
          {project.relationships.filter((relationship) => relationship.from === activePerson.id || relationship.to === activePerson.id).map((relationship) => (
            <div className="list-row relationship-row" key={relationship.id}>
              <span>{relationshipLabel(project, relationship, familyText)}</span>
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
      <select onChange={(event) => { onPick(event.currentTarget.value); event.currentTarget.value = ""; }} value="">
        <option value="">{t("choosePerson")}</option>
        {people.map((person) => <option key={person.id} value={person.id}>{personName(person, familyText)}</option>)}
      </select>
    </label>
  );
}

function splitTags(value: string): string[] {
  return value.split(",").map((tag) => tag.trim()).filter(Boolean);
}