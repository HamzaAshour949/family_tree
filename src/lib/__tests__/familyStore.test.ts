import { beforeEach, describe, expect, it } from "vitest";
import { createBlankProject, useFamilyStore } from "../../store/familyStore";
import type { Gender } from "../../types";
import { project as buildProject, person, relationship } from "./helpers";

const store = () => useFamilyStore.getState();

function addPerson(gender: Gender, overrides = {}) {
  return store().addPerson({ gender, ...overrides });
}

beforeEach(() => {
  useFamilyStore.setState({
    project: createBlankProject(),
    filePath: undefined,
    isDirty: false,
    selectedPersonId: undefined,
    searchQuery: "",
    activeView: "tree",
    genderFilter: "all",
  });
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
});

describe("people and relationships", () => {
  it("selects a newly added person", () => {
    const id = addPerson("female");
    expect(store().selectedPersonId).toBe(id);
    expect(store().project.people).toHaveLength(1);
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
