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
  const ended = person.deathDate ? new Date(person.deathDate) : new Date();
  if (!born || Number.isNaN(born.getTime())) return labels.ageUnknown;
  let age = ended.getFullYear() - born.getFullYear();
  const beforeBirthday = ended.getMonth() < born.getMonth() || (ended.getMonth() === born.getMonth() && ended.getDate() < born.getDate());
  if (beforeBirthday) age -= 1;
  return labels.ageYears(age, Boolean(person.deathDate));
}

export function relationshipCounts(project: FamilyTreeProject, personId: string) {
  const parents = project.relationships.filter((relationship) => relationship.type === "parent-child" && relationship.to === personId).length;
  const children = project.relationships.filter((relationship) => relationship.type === "parent-child" && relationship.from === personId).length;
  const spouses = project.relationships.filter((relationship) => relationship.type === "spouse" && (relationship.from === personId || relationship.to === personId)).length;
  return { parents, spouses, children };
}

export function filteredPeople(project: FamilyTreeProject, searchQuery: string, genderFilter: Gender | "all") {
  const normalized = searchQuery.trim().toLowerCase();
  return project.people.filter((person) => {
    const matchesGender = genderFilter === "all" || person.gender === genderFilter;
    const searchBlob = [personName(person), person.birthPlace, person.deathPlace, person.occupation, person.notes, person.tags.join(" ")]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return matchesGender && (normalized.length === 0 || searchBlob.includes(normalized));
  });
}

export function generationMap(project: FamilyTreeProject): Map<string, number> {
  const generation = new Map(project.people.map((person) => [person.id, 0]));
  const parentEdges = project.relationships.filter((relationship) => relationship.type === "parent-child");
  for (let pass = 0; pass < project.people.length; pass += 1) {
    let changed = false;
    for (const edge of parentEdges) {
      const parentGeneration = generation.get(edge.from) ?? 0;
      const nextGeneration = Math.max(generation.get(edge.to) ?? 0, parentGeneration + 1);
      if (nextGeneration !== generation.get(edge.to)) {
        generation.set(edge.to, nextGeneration);
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (const spouse of project.relationships.filter((relationship) => relationship.type === "spouse")) {
    const sharedGeneration = Math.min(generation.get(spouse.from) ?? 0, generation.get(spouse.to) ?? 0);
    generation.set(spouse.from, sharedGeneration);
    generation.set(spouse.to, sharedGeneration);
  }
  return generation;
}

export function relatedPeople(project: FamilyTreeProject, personId: string) {
  const peopleById = new Map(project.people.map((person) => [person.id, person]));
  const parents: Person[] = [];
  const children: Person[] = [];
  const spouses: Person[] = [];
  for (const relationship of project.relationships) {
    if (relationship.type === "parent-child" && relationship.to === personId) {
      const parent = peopleById.get(relationship.from);
      if (parent) parents.push(parent);
    }
    if (relationship.type === "parent-child" && relationship.from === personId) {
      const child = peopleById.get(relationship.to);
      if (child) children.push(child);
    }
    if (relationship.type === "spouse") {
      const spouseId = relationship.from === personId ? relationship.to : relationship.to === personId ? relationship.from : undefined;
      const spouse = spouseId ? peopleById.get(spouseId) : undefined;
      if (spouse) spouses.push(spouse);
    }
  }
  return { parents, spouses, children };
}

export function relationshipLabel(project: FamilyTreeProject, relationship: Relationship, labels: FamilyTextLabels = defaultFamilyTextLabels): string {
  const peopleById = new Map(project.people.map((person) => [person.id, person]));
  const from = peopleById.get(relationship.from);
  const to = peopleById.get(relationship.to);
  const fromName = from ? personName(from, labels) : labels.unknownPerson;
  const toName = to ? personName(to, labels) : labels.unknownPerson;
  return relationship.type === "parent-child" ? `${fromName} -> ${toName}` : `${fromName} + ${toName}`;
}

export function timelineEvents(project: FamilyTreeProject, labels: FamilyTextLabels = defaultFamilyTextLabels): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const peopleById = new Map(project.people.map((person) => [person.id, person]));
  for (const person of project.people) {
    const birthYear = yearFromDate(person.birthDate);
    if (birthYear) {
      events.push({ id: `${person.id}-birth`, year: birthYear, date: person.birthDate, title: labels.birthEventTitle(personName(person, labels)), personId: person.id, kind: "birth", detail: person.birthPlace ? labels.birthplaceDetail(person.birthPlace) : labels.birthRecorded });
    }
    const deathYear = yearFromDate(person.deathDate);
    if (deathYear) {
      events.push({ id: `${person.id}-death`, year: deathYear, date: person.deathDate, title: labels.deathEventTitle(personName(person, labels)), personId: person.id, kind: "death", detail: person.deathPlace ? labels.deathPlaceDetail(person.deathPlace) : ageLabel(person, labels) });
    }
  }
  for (const relationship of project.relationships.filter((item) => item.type === "spouse" && item.date)) {
    const year = yearFromDate(relationship.date);
    const first = peopleById.get(relationship.from);
    const second = peopleById.get(relationship.to);
    if (year && first && second) {
      events.push({ id: `${relationship.id}-marriage`, year, date: relationship.date, title: labels.marriageEventTitle(personName(first, labels), personName(second, labels)), kind: "marriage", detail: labels.marriageRecorded });
    }
  }
  return events.sort((first, second) => first.year - second.year || first.title.localeCompare(second.title));
}