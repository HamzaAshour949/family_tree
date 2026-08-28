import { FTREE_SCHEMA, type FamilyTreeProject, type Person, type Relationship } from "../../types";

export function person(id: string, overrides: Partial<Person> = {}): Person {
  return { id, firstName: id, lastName: "Test", gender: "male", tags: [], ...overrides };
}

export function relationship(id: string, type: Relationship["type"], from: string, to: string, overrides: Partial<Relationship> = {}): Relationship {
  return { id, type, from, to, ...overrides };
}

export function project(people: Person[], relationships: Relationship[] = []): FamilyTreeProject {
  return {
    schema: FTREE_SCHEMA,
    version: 1,
    id: "project-test",
    name: "Test Tree",
    description: "",
    people,
    relationships,
    settings: { compactNodes: false, showLinkCounts: true, showPhotos: true, sortByDates: true },
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
  };
}
