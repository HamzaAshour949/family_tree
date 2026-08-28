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
 * parent, and spouses share a row.
 *
 * Both rules only ever push people further down, so the two are relaxed
 * together until nothing moves. Running the spouse pass once at the end is not
 * enough - levelling a couple shifts a parent, which in turn has to push their
 * children down again.
 */
export function generationMap(people: Person[], relationships: Relationship[]): Map<string, number> {
  const generation = new Map(people.map((person) => [person.id, 0]));
  const parentEdges = relationships.filter((relationship) => relationship.type === "parent-child");
  const spouseEdges = relationships.filter((relationship) => relationship.type === "spouse");

  // Each pass moves at least one person down a whole row, so a tree of n people
  // settles within n passes. The bound also stops a cyclic imported file from
  // spinning forever.
  for (let pass = 0; pass <= people.length; pass += 1) {
    let changed = false;

    for (const edge of parentEdges) {
      const childRow = (generation.get(edge.from) ?? 0) + 1;
      if (childRow > (generation.get(edge.to) ?? 0)) {
        generation.set(edge.to, childRow);
        changed = true;
      }
    }

    // A couple is pulled down to the deeper partner. Pulling up to the
    // shallower one instead would seat somebody who married into the family on
    // their own parent-in-law's row and leave their children a row adrift.
    for (const edge of spouseEdges) {
      const from = generation.get(edge.from) ?? 0;
      const to = generation.get(edge.to) ?? 0;
      if (from === to) continue;
      const shared = Math.max(from, to);
      generation.set(edge.from, shared);
      generation.set(edge.to, shared);
      changed = true;
    }

    if (!changed) break;
  }

  return compactTowardsChildren(people, parentEdges, spouseEdges, generation);
}

/**
 * The relaxation above only knows how to push people down from their own
 * ancestors, so anyone added without ancestry - the mother attached to a
 * great-grandchild, a spouse who married in - stays stranded on the top row
 * with one long edge reaching down to their children.
 *
 * This pass drops each couple to sit directly above their shallowest child.
 * Moving a couple *down* can never seat a child on or above a parent, so the
 * guarantees established above survive untouched.
 */
function compactTowardsChildren(
  people: Person[],
  parentEdges: Relationship[],
  spouseEdges: Relationship[],
  generation: Map<string, number>,
): Map<string, number> {
  const childrenByParent = new Map<string, string[]>();
  for (const edge of parentEdges) {
    const children = childrenByParent.get(edge.from);
    if (children) children.push(edge.to);
    else childrenByParent.set(edge.from, [edge.to]);
  }

  // Spouses have to travel together, so they are moved a whole couple at a time.
  const couples = spouseGroups(people, spouseEdges);

  for (let pass = 0; pass <= people.length; pass += 1) {
    let changed = false;
    for (const couple of couples) {
      let lowestChildRow = Number.POSITIVE_INFINITY;
      for (const id of couple) {
        for (const childId of childrenByParent.get(id) ?? []) {
          lowestChildRow = Math.min(lowestChildRow, generation.get(childId) ?? 0);
        }
      }
      // Childless people have nothing to sink towards and stay where they are.
      if (!Number.isFinite(lowestChildRow)) continue;

      const target = lowestChildRow - 1;
      if (target <= (generation.get(couple[0]) ?? 0)) continue;
      for (const id of couple) generation.set(id, target);
      changed = true;
    }
    if (!changed) break;
  }

  return generation;
}

/** Everyone reachable from each other through spouse links, as one row-locked unit. */
function spouseGroups(people: Person[], spouseEdges: Relationship[]): string[][] {
  const partners = new Map<string, string[]>();
  for (const edge of spouseEdges) {
    addPartner(partners, edge.from, edge.to);
    addPartner(partners, edge.to, edge.from);
  }

  const remaining = new Set(people.map((person) => person.id));
  const groups: string[][] = [];
  for (const person of people) {
    if (!remaining.delete(person.id)) continue;
    const group = [person.id];
    const queue = [person.id];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      for (const partner of partners.get(current) ?? []) {
        if (!remaining.delete(partner)) continue;
        group.push(partner);
        queue.push(partner);
      }
    }
    groups.push(group);
  }
  return groups;
}

function addPartner(partners: Map<string, string[]>, from: string, to: string): void {
  const existing = partners.get(from);
  if (existing) existing.push(to);
  else partners.set(from, [to]);
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
