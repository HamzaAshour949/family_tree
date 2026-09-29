import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBlankProject, useFamilyStore } from "../../store/familyStore";
import type { Gender } from "../../types";
import { project as buildProject, person, relationship } from "./helpers";

const store = () => useFamilyStore.getState();

function addPerson(gender: Gender, overrides = {}) {
  return store().addPerson({ gender, ...overrides });
}

beforeEach(() => {
  store().createProject();
  useFamilyStore.setState({ activeView: "tree", language: "en" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("document lifecycle", () => {
  it("starts clean and becomes dirty on the first edit", () => {
    expect(store().isDirty).toBe(false);
    addPerson("male");
    expect(store().isDirty).toBe(true);
  });

  it("clears the dirty flag and remembers the path once saved", () => {
    addPerson("male");
    store().markSaved("/tmp/tree.ftree");
    expect(store()).toMatchObject({ isDirty: false, filePath: "/tmp/tree.ftree" });
  });

  it("stays dirty when edits were made while the save was still being written", () => {
    addPerson("male");
    const written = store().project; // what was handed to the disk
    addPerson("female"); // typed while the write was in flight

    store().markSaved("/tmp/tree.ftree", written);
    expect(store().isDirty).toBe(true);
    expect(store().filePath).toBe("/tmp/tree.ftree");

    // Undoing the late edit lands exactly on what was saved.
    store().undo();
    expect(store().isDirty).toBe(false);
  });

  it("forgets the previous file when a new project is started", () => {
    store().markSaved("/tmp/tree.ftree");
    store().createProject();
    expect(store()).toMatchObject({ filePath: undefined, isDirty: false, selectedPersonId: undefined });
    expect(store().project.people).toEqual([]);
  });

  it("treats a freshly loaded project as saved", () => {
    store().loadProject(buildProject([person("a")]), "/tmp/opened.ftree");
    expect(store()).toMatchObject({ isDirty: false, filePath: "/tmp/opened.ftree" });
  });

  it("clears the search and gender filter when another project is opened", () => {
    store().setSearchQuery("someone");
    store().setGenderFilter("female");
    store().loadProject(buildProject([person("a")]));
    expect(store()).toMatchObject({ searchQuery: "", genderFilter: "all" });
  });

  it("signals the canvas to refit whenever a project is opened", () => {
    const before = store().loadSerial;
    store().loadProject(buildProject([person("a")]));
    expect(store().loadSerial).toBe(before + 1);
    store().createProject();
    expect(store().loadSerial).toBe(before + 2);
  });
});

describe("people and relationships", () => {
  it("selects a newly added person and flags them as new", () => {
    const id = addPerson("female");
    expect(store().selectedPersonId).toBe(id);
    expect(store().newPersonId).toBe(id);
    expect(store().project.people).toHaveLength(1);
  });

  it("stops flagging the person as new once something else is selected", () => {
    const first = addPerson("male");
    const second = addPerson("female");
    store().selectPerson(first);
    expect(store().newPersonId).toBeUndefined();
    expect(store().selectedPersonId).toBe(first);
    expect(second).not.toBe(first);
  });

  it("names new people in the interface language", () => {
    useFamilyStore.setState({ language: "ar" });
    const id = addPerson("male");
    const created = store().project.people.find((item) => item.id === id);
    expect(created?.firstName).toBe("شخص");
    expect(created?.lastName).toBe("جديد");
  });

  it("stores spouse links with the husband first regardless of input order", () => {
    const wife = addPerson("female");
    const husband = addPerson("male");
    expect(store().addRelationship({ type: "spouse", from: wife, to: husband })).toEqual({ ok: true });
    expect(store().project.relationships[0]).toMatchObject({ from: husband, to: wife });
  });

  it("refuses an invalid link and leaves the project untouched", () => {
    const first = addPerson("male");
    const second = addPerson("male");
    const before = store().project.relationships;

    expect(store().addRelationship({ type: "spouse", from: first, to: second })).toEqual({
      ok: false,
      reason: "relationshipNotAllowedSpouseGender",
    });
    expect(store().project.relationships).toBe(before);
  });

  it("removes every relationship attached to a deleted person", () => {
    const father = addPerson("male");
    const child = addPerson("male");
    const mother = addPerson("female");
    store().addRelationship({ type: "parent-child", from: father, to: child });
    store().addRelationship({ type: "parent-child", from: mother, to: child });
    store().addRelationship({ type: "spouse", from: father, to: mother });

    store().selectPerson(child);
    store().removePerson(child);
    expect(store().project.people).toHaveLength(2);
    expect(store().project.relationships).toHaveLength(1);
    expect(store().selectedPersonId).toBeUndefined();
  });

  it("keeps the selection when an unrelated person is removed", () => {
    const kept = addPerson("male");
    const removed = addPerson("male");
    store().selectPerson(kept);
    store().removePerson(removed);
    expect(store().selectedPersonId).toBe(kept);
  });

  it("patches only the targeted person", () => {
    const first = addPerson("male");
    const second = addPerson("male");
    store().updatePerson(first, { firstName: "Renamed" });

    expect(store().project.people.find((item) => item.id === first)?.firstName).toBe("Renamed");
    expect(store().project.people.find((item) => item.id === second)?.firstName).toBe("New");
  });

  it("records a marriage date on the relationship", () => {
    const husband = addPerson("male");
    const wife = addPerson("female");
    store().addRelationship({ type: "spouse", from: husband, to: wife });
    const id = store().project.relationships[0]!.id;
    store().updateRelationship(id, { date: "1980-05-01" });
    expect(store().project.relationships[0]?.date).toBe("1980-05-01");
  });
});

describe("addRelative", () => {
  it("creates the person and the link together and selects them", () => {
    const father = store().addPerson({ gender: "male", lastName: "Nasser" });
    const result = store().addRelative(father, "son");

    expect(result.ok).toBe(true);
    expect(store().project.people).toHaveLength(2);
    expect(store().project.relationships).toEqual([expect.objectContaining({ type: "parent-child", from: father })]);
    expect(result.ok && store().selectedPersonId).toBe(result.ok ? result.personId : undefined);
  });

  it("gives a son of a man his family name but leaves a mother's child unnamed", () => {
    const father = store().addPerson({ gender: "male", lastName: "Nasser" });
    const mother = store().addPerson({ gender: "female", lastName: "Haddad" });
    const sonOfFather = store().addRelative(father, "son");
    const sonOfMother = store().addRelative(mother, "son");

    const lastNameOf = (result: typeof sonOfFather) => store().project.people.find((item) => result.ok && item.id === result.personId)?.lastName;
    expect(lastNameOf(sonOfFather)).toBe("Nasser");
    expect(lastNameOf(sonOfMother)).toBe("Person");
  });

  it("changes nothing at all when the rules refuse the relative", () => {
    const child = store().addPerson({ gender: "male" });
    expect(store().addRelative(child, "father").ok).toBe(true);
    store().markSaved("/tmp/x.ftree");
    store().selectPerson(child);
    const before = store().project;

    // The child already has a father, so a second one is refused.
    const result = store().addRelative(child, "father");
    expect(result).toEqual({ ok: false, reason: "relationshipNotAllowedParentGenderSlot" });
    expect(store().project).toBe(before);
    expect(store().isDirty).toBe(false);
    expect(store().selectedPersonId).toBe(child);
    expect(store().past).toHaveLength(2);
  });

  it("creates a spouse of the opposite gender with the husband stored first", () => {
    const wife = store().addPerson({ gender: "female" });
    const result = store().addRelative(wife, "spouse");
    expect(result.ok).toBe(true);
    const husband = store().project.people.find((item) => result.ok && item.id === result.personId);
    expect(husband?.gender).toBe("male");
    expect(store().project.relationships[0]).toMatchObject({ type: "spouse", from: husband?.id, to: wife });
  });

  it("refuses to add a relative to somebody who does not exist", () => {
    expect(store().addRelative("ghost", "son").ok).toBe(false);
    expect(store().project.people).toHaveLength(0);
  });
});

describe("changeGender", () => {
  it("changes the gender of a person with no links", () => {
    const id = addPerson("male");
    expect(store().changeGender(id, "female")).toEqual({ ok: true });
    expect(store().project.people[0]?.gender).toBe("female");
  });

  it("refuses when it would leave a married couple of the same gender", () => {
    const husband = addPerson("male");
    const wife = addPerson("female");
    store().addRelationship({ type: "spouse", from: husband, to: wife });
    expect(store().changeGender(wife, "male")).toEqual({ ok: false, reason: "relationshipNotAllowedSpouseGender" });
    expect(store().project.people.find((item) => item.id === wife)?.gender).toBe("female");
  });

  it("refuses when the child would end up with two fathers", () => {
    const father = addPerson("male");
    const mother = addPerson("female");
    const child = addPerson("male");
    store().addRelationship({ type: "parent-child", from: father, to: child });
    store().addRelationship({ type: "parent-child", from: mother, to: child });
    expect(store().changeGender(mother, "male")).toEqual({ ok: false, reason: "relationshipNotAllowedParentGenderSlot" });
  });

  it("allows switching the only parent of a child", () => {
    const parent = addPerson("male");
    const child = addPerson("male");
    store().addRelationship({ type: "parent-child", from: parent, to: child });
    expect(store().changeGender(parent, "female")).toEqual({ ok: true });
  });
});

describe("undo and redo", () => {
  it("steps back through edits and forward again", () => {
    const id = addPerson("male");
    store().addRelative(id, "son");
    expect(store().project.people).toHaveLength(2);

    store().undo();
    expect(store().project.people).toHaveLength(1);
    store().undo();
    expect(store().project.people).toHaveLength(0);

    store().redo();
    expect(store().project.people).toHaveLength(1);
    store().redo();
    expect(store().project.people).toHaveLength(2);
    expect(store().project.relationships).toHaveLength(1);
  });

  it("does nothing when there is nothing to undo or redo", () => {
    const before = store().project;
    store().undo();
    store().redo();
    expect(store().project).toBe(before);
  });

  it("discards the redo stack when a new edit is made", () => {
    addPerson("male");
    store().undo();
    expect(store().future).toHaveLength(1);
    addPerson("female");
    expect(store().future).toHaveLength(0);
  });

  it("undoes a deletion, restoring the person and their links", () => {
    const father = addPerson("male");
    const relative = store().addRelative(father, "son");
    store().removePerson(father);
    expect(store().project.relationships).toHaveLength(0);

    store().undo();
    expect(store().project.people).toHaveLength(2);
    expect(store().project.relationships).toHaveLength(1);
    expect(relative.ok).toBe(true);
  });

  it("reads as clean again when undo returns to the saved state", () => {
    addPerson("male");
    store().markSaved("/tmp/tree.ftree");
    addPerson("female");
    expect(store().isDirty).toBe(true);

    store().undo();
    expect(store().isDirty).toBe(false);
    store().redo();
    expect(store().isDirty).toBe(true);
  });

  it("is dirty after undoing past the saved state", () => {
    addPerson("male");
    store().markSaved("/tmp/tree.ftree");
    store().undo();
    expect(store().isDirty).toBe(true);
    store().redo();
    expect(store().isDirty).toBe(false);
  });

  it("drops the selection when undo removes the selected person", () => {
    addPerson("male");
    expect(store().selectedPersonId).toBeDefined();
    store().undo();
    expect(store().selectedPersonId).toBeUndefined();
  });

  it("starts with an empty history for each opened project", () => {
    addPerson("male");
    store().loadProject(buildProject([person("a")]));
    expect(store().past).toHaveLength(0);
    store().undo();
    expect(store().project.people).toHaveLength(1);
  });

  it("folds typing in one field into a single undo step", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 1, 12, 0, 0));
    const id = addPerson("male");
    store().markSaved("/tmp/tree.ftree");

    for (const name of ["A", "Al", "Ali"]) {
      store().updatePerson(id, { firstName: name });
      vi.advanceTimersByTime(200);
    }
    expect(store().past).toHaveLength(2); // creating the person + the whole rename

    store().undo();
    expect(store().project.people[0]?.firstName).toBe("New");
  });

  it("starts a new step after a pause, or when a different field is edited", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 1, 12, 0, 0));
    const id = addPerson("male");

    store().updatePerson(id, { firstName: "Ali" });
    vi.advanceTimersByTime(1500);
    store().updatePerson(id, { firstName: "Alim" });
    store().updatePerson(id, { lastName: "Nasser" });
    expect(store().past).toHaveLength(4);
  });

  it("caps the history so a long session cannot grow without bound", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 1));
    for (let index = 0; index < 260; index += 1) {
      addPerson("male");
      vi.advanceTimersByTime(2000);
    }
    expect(store().past.length).toBeLessThanOrEqual(200);
  });
});

describe("loadProject", () => {
  it("normalizes settings and spouse direction from the incoming file", () => {
    store().loadProject(
      buildProject(
        [person("husband"), person("wife", { gender: "female" })],
        [relationship("r1", "spouse", "wife", "husband")],
      ),
    );
    expect(store().project.relationships[0]).toMatchObject({ from: "husband", to: "wife" });
    expect(store().project.settings.showPhotos).toBe(true);
  });
});

describe("blank project", () => {
  it("is a valid, empty document", () => {
    const blank = createBlankProject();
    expect(blank.people).toEqual([]);
    expect(blank.relationships).toEqual([]);
    expect(blank.id).toMatch(/^project-/);
  });
});
