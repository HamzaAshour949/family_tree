import type { FamilyTreeProject, Gender, Person, Relationship, TimelineEvent } from "../types";

export interface FamilyTextLabels {
  unnamedPerson: string;
  datesUnknown: string;
  bornYear: (year: number) => string;
  diedYear: (year: number) => string;
  ageUnknown: string;
  ageYears: (age: number, deceased: boolean) => string;
  unknownPerson: string;
  birthEventTitle: (name: string) => string;
  deathEventTitle: (name: string) => string;
  marriageEventTitle: (firstName: string, secondName: string) => string;
  birthplaceDetail: (place: string) => string;
  deathPlaceDetail: (place: string) => string;
  birthRecorded: string;
  marriageRecorded: string;
}

export interface RelationshipCounts {
  parents: number;
  spouses: number;
  children: number;
}

export type PersonDirectory = Map<string, Person>;

export const defaultFamilyTextLabels: FamilyTextLabels = {
  unnamedPerson: "Unnamed person",
  datesUnknown: "Dates unknown",
  bornYear: (year) => `b. ${year}`,
  diedYear: (year) => `d. ${year}`,
  ageUnknown: "Age unknown",
  ageYears: (age, deceased) => (deceased ? `${age} years` : `${age} years old`),
  unknownPerson: "Unknown",
  birthEventTitle: (name) => `${name} born`,
  deathEventTitle: (name) => `${name} died`,
  marriageEventTitle: (firstName, secondName) => `${firstName} and ${secondName} married`,
  birthplaceDetail: (place) => `Birthplace: ${place}`,
  deathPlaceDetail: (place) => `Place: ${place}`,
  birthRecorded: "Birth recorded",
  marriageRecorded: "Marriage relationship recorded",
};

export function peopleById(people: Person[]): PersonDirectory {
  return new Map(people.map((person) => [person.id, person]));
}

export function personName(person: Person, labels: FamilyTextLabels = defaultFamilyTextLabels): string {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return name.length > 0 ? name : labels.unnamedPerson;
}

export function yearFromDate(value?: string): number | undefined {
  if (!value) return undefined;
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : undefined;
}

export function lifeLabel(person: Person, labels: FamilyTextLabels = defaultFamilyTextLabels): string {
  const born = yearFromDate(person.birthDate);
  const died = yearFromDate(person.deathDate);
  if (born && died) return `${born}-${died}`;
  if (born) return labels.bornYear(born);
  if (died) return labels.diedYear(died);
  return labels.datesUnknown;
}

export function ageLabel(person: Person, labels: FamilyTextLabels = defaultFamilyTextLabels): string {
  const born = person.birthDate ? new Date(person.birthDate) : undefined;
  if (!born || Number.isNaN(born.getTime())) return labels.ageUnknown;
  const ended = person.deathDate ? new Date(person.deathDate) : new Date();
  if (Number.isNaN(ended.getTime())) return labels.ageUnknown;

  let age = ended.getFullYear() - born.getFullYear();
  const beforeBirthday = ended.getMonth() < born.getMonth() || (ended.getMonth() === born.getMonth() && ended.getDate() < born.getDate());
  if (beforeBirthday) age -= 1;
  if (age < 0) return labels.ageUnknown;
  return labels.ageYears(age, Boolean(person.deathDate));
}

/**
 * Counts every person's links in a single pass. Calling a per-person counter
 * inside a render loop is quadratic on large trees; this is linear.
 */
export function relationshipCountsById(people: Person[], relationships: Relationship[]): Map<string, RelationshipCounts> {
  const counts = new Map<string, RelationshipCounts>(people.map((person) => [person.id, { parents: 0, spouses: 0, children: 0 }]));
  for (const relationship of relationships) {
    const from = counts.get(relationship.from);
    const to = counts.get(relationship.to);
    if (relationship.type === "spouse") {
      if (from) from.spouses += 1;
      if (to) to.spouses += 1;
      continue;
    }
    if (from) from.children += 1;
    if (to) to.parents += 1;
  }
  return counts;
}

export function totalLinks(counts: RelationshipCounts | undefined): number {
  return counts ? counts.parents + counts.spouses + counts.children : 0;
}

export function filteredPeople(people: Person[], searchQuery: string, genderFilter: Gender | "all"): Person[] {
  const normalized = searchQuery.trim().toLowerCase();
  return people.filter((person) => {
    if (genderFilter !== "all" && person.gender !== genderFilter) return false;
    if (normalized.length === 0) return true;
    return searchBlob(person).includes(normalized);
  });
}

function searchBlob(person: Person): string {
  return [personName(person), person.birthPlace, person.deathPlace, person.occupation, person.notes, person.tags.join(" ")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Assigns each person a depth: children always sit one row below their deepest
 * parent, and spouses are pulled onto the shallower partner's row.
 */
export function generationMap(people: Person[], relationships: Relationship[]): Map<string, number> {
  const generation = new Map(people.map((person) => [person.id, 0]));
  const parentEdges = relationships.filter((relationship) => relationship.type === "parent-child");

  for (let pass = 0; pass < people.length; pass += 1) {
    let changed = false;
    for (const edge of parentEdges) {
      const parentGeneration = generation.get(edge.from) ?? 0;
      const current = generation.get(edge.to) ?? 0;
      if (parentGeneration + 1 > current) {
        generation.set(edge.to, parentGeneration + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  for (const spouse of relationships) {
    if (spouse.type !== "spouse") continue;
    const shared = Math.min(generation.get(spouse.from) ?? 0, generation.get(spouse.to) ?? 0);
    generation.set(spouse.from, shared);
    generation.set(spouse.to, shared);
  }
  return generation;
}

export function relatedPeople(directory: PersonDirectory, relationships: Relationship[], personId: string) {
  const parents: Person[] = [];
  const children: Person[] = [];
  const spouses: Person[] = [];
  for (const relationship of relationships) {
    if (relationship.type === "parent-child") {
      if (relationship.to === personId) push(parents, directory.get(relationship.from));
      else if (relationship.from === personId) push(children, directory.get(relationship.to));
      continue;
    }
    if (relationship.from === personId) push(spouses, directory.get(relationship.to));
    else if (relationship.to === personId) push(spouses, directory.get(relationship.from));
  }
  return { parents, spouses, children };
}

function push(target: Person[], person: Person | undefined): void {
  if (person) target.push(person);
}

export function relationshipLabel(directory: PersonDirectory, relationship: Relationship, labels: FamilyTextLabels = defaultFamilyTextLabels): string {
  const from = directory.get(relationship.from);
  const to = directory.get(relationship.to);
  const fromName = from ? personName(from, labels) : labels.unknownPerson;
  const toName = to ? personName(to, labels) : labels.unknownPerson;
  return relationship.type === "parent-child" ? `${fromName} → ${toName}` : `${fromName} + ${toName}`;
}

export function timelineEvents(project: FamilyTreeProject, labels: FamilyTextLabels = defaultFamilyTextLabels): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const directory = peopleById(project.people);

  for (const person of project.people) {
    const birthYear = yearFromDate(person.birthDate);
    if (birthYear) {
      events.push({
        id: `${person.id}-birth`,
        year: birthYear,
        date: person.birthDate,
        title: labels.birthEventTitle(personName(person, labels)),
        personId: person.id,
        kind: "birth",
        detail: person.birthPlace ? labels.birthplaceDetail(person.birthPlace) : labels.birthRecorded,
      });
    }
    const deathYear = yearFromDate(person.deathDate);
    if (deathYear) {
      events.push({
        id: `${person.id}-death`,
        year: deathYear,
        date: person.deathDate,
        title: labels.deathEventTitle(personName(person, labels)),
        personId: person.id,
        kind: "death",
        detail: person.deathPlace ? labels.deathPlaceDetail(person.deathPlace) : ageLabel(person, labels),
      });
    }
  }

  for (const relationship of project.relationships) {
    if (relationship.type !== "spouse" || !relationship.date) continue;
    const year = yearFromDate(relationship.date);
    const first = directory.get(relationship.from);
    const second = directory.get(relationship.to);
    if (!year || !first || !second) continue;
    events.push({
      id: `${relationship.id}-marriage`,
      year,
      date: relationship.date,
      title: labels.marriageEventTitle(personName(first, labels), personName(second, labels)),
      kind: "marriage",
      detail: labels.marriageRecorded,
    });
  }

  return events.sort((first, second) => first.year - second.year || first.title.localeCompare(second.title));
}
