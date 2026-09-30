import { dateSortKey, parseDateParts, todayParts, yearsBetween } from "./dates";
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
  /** "1 link", "3 links": counts need the right plural form in each language. */
  linksCount: (count: number) => string;
  timelineSummary: (events: number, people: number) => string;
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
  linksCount: (count) => `${count} ${count === 1 ? "link" : "links"}`,
  timelineSummary: (events, people) => `${events} dated ${events === 1 ? "event" : "events"} across ${people} ${people === 1 ? "person" : "people"}`,
};

export function peopleById(people: Person[]): PersonDirectory {
  return new Map(people.map((person) => [person.id, person]));
}

export function personName(person: Person, labels: FamilyTextLabels = defaultFamilyTextLabels): string {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return name.length > 0 ? name : labels.unnamedPerson;
}

export function yearFromDate(value?: string): number | undefined {
  return parseDateParts(value)?.year;
}

export function lifeLabel(person: Person, labels: FamilyTextLabels = defaultFamilyTextLabels): string {
  const born = yearFromDate(person.birthDate);
  const died = yearFromDate(person.deathDate);
  if (born !== undefined && died !== undefined) return `${born}-${died}`;
  if (born !== undefined) return labels.bornYear(born);
  if (died !== undefined) return labels.diedYear(died);
  return labels.datesUnknown;
}

/** `today` is injectable so age can be tested without faking the clock. */
export function ageLabel(person: Person, labels: FamilyTextLabels = defaultFamilyTextLabels, today: Date = new Date()): string {
  const born = parseDateParts(person.birthDate);
  if (!born) return labels.ageUnknown;
  const deceased = Boolean(person.deathDate);
  const ended = deceased ? parseDateParts(person.deathDate) : todayParts(today);
  if (!ended) return labels.ageUnknown;

  const age = yearsBetween(born, ended);
  return age === undefined ? labels.ageUnknown : labels.ageYears(age, deceased);
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
  const normalized = normalizeSearchText(searchQuery.trim());
  return people.filter((person) => {
    if (genderFilter !== "all" && person.gender !== genderFilter) return false;
    if (normalized.length === 0) return true;
    return searchBlob(person).includes(normalized);
  });
}

function searchBlob(person: Person): string {
  return normalizeSearchText(
    [personName(person), person.birthPlace, person.deathPlace, person.occupation, person.notes, person.tags.join(" ")].filter(Boolean).join(" "),
  );
}

/**
 * Makes search forgiving in the two scripts the app supports: Latin accents
 * ("José" matches "jose") and Arabic spelling variants - vowel marks, the
 * hamza forms of alef, and the interchangeable ending letters.
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g, "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
    .replace(/\u0649/g, "\u064a")
    .replace(/\u0629/g, "\u0647")
    .toLowerCase();
}

/**
 * Assigns each person a depth: a child always sits below every parent, and
 * spouses share a row.
 *
 * A spouse pair is aligned on the *deeper* partner's row. Aligning on the
 * shallower one would lift a married-in spouse above their own parents. The two
 * rules feed each other (moving a spouse down pushes their children down), so
 * they are applied together until nothing changes.
 *
 * Consistent data settles within `people.length` rounds. A hand-edited file
 * with an ancestry loop never settles, so the rounds and the depth are capped
 * and the loop simply produces a flat, still-readable layout.
 */
export function generationMap(people: Person[], relationships: Relationship[]): Map<string, number> {
  const generation = new Map(people.map((person) => [person.id, 0]));
  const known = (relationship: Relationship) => generation.has(relationship.from) && generation.has(relationship.to);
  const parentEdges = relationships.filter((relationship) => relationship.type === "parent-child" && known(relationship));
  const spouseEdges = relationships.filter((relationship) => relationship.type === "spouse" && known(relationship));
  const maxDepth = Math.max(0, people.length - 1);

  for (let round = 0; round <= people.length; round += 1) {
    let changed = false;
    for (const edge of parentEdges) {
      const wanted = Math.min(maxDepth, (generation.get(edge.from) ?? 0) + 1);
      if (wanted > (generation.get(edge.to) ?? 0)) {
        generation.set(edge.to, wanted);
        changed = true;
      }
    }
    for (const edge of spouseEdges) {
      const shared = Math.max(generation.get(edge.from) ?? 0, generation.get(edge.to) ?? 0);
      if (generation.get(edge.from) !== shared || generation.get(edge.to) !== shared) {
        generation.set(edge.from, shared);
        generation.set(edge.to, shared);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return sinkRootlessCouples(people, parentEdges, spouseEdges, generation);
}

/**
 * The relaxation above only pushes people down from their own ancestors, so a
 * parent with no recorded ancestry - a mother added to a great-grandchild, the
 * parents of somebody who married in - stays stranded on the top row with one
 * long edge reaching down past everybody in between.
 *
 * This pass drops each such couple to sit directly above their shallowest
 * child. It only moves couples in which nobody has recorded parents: anyone
 * with parents already has a row that keeps them level with their siblings,
 * and moving them would break that. Moving a couple *down* towards their
 * children can never seat a child on or above a parent, so the guarantees
 * established above survive.
 */
function sinkRootlessCouples(
  people: Person[],
  parentEdges: Relationship[],
  spouseEdges: Relationship[],
  generation: Map<string, number>,
): Map<string, number> {
  const childrenByParent = new Map<string, string[]>();
  const hasParents = new Set<string>();
  for (const edge of parentEdges) {
    const children = childrenByParent.get(edge.from);
    if (children) children.push(edge.to);
    else childrenByParent.set(edge.from, [edge.to]);
    hasParents.add(edge.to);
  }

  // Spouses have to travel together, so they are moved a whole couple at a time.
  const couples = spouseGroups(people, spouseEdges).filter((couple) => couple.every((id) => !hasParents.has(id)));

  for (let round = 0; round <= people.length; round += 1) {
    let changed = false;
    for (const couple of couples) {
      let shallowestChildRow = Number.POSITIVE_INFINITY;
      for (const id of couple) {
        for (const childId of childrenByParent.get(id) ?? []) {
          shallowestChildRow = Math.min(shallowestChildRow, generation.get(childId) ?? 0);
        }
      }
      // Childless people have nothing to sink towards and stay where they are.
      if (!Number.isFinite(shallowestChildRow)) continue;

      const target = shallowestChildRow - 1;
      if (couple.every((id) => (generation.get(id) ?? 0) >= target)) continue;
      for (const id of couple) generation.set(id, Math.max(target, generation.get(id) ?? 0));
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

  return events.sort((first, second) => eventSortKey(first) - eventSortKey(second) || first.title.localeCompare(second.title));
}

function eventSortKey(event: TimelineEvent): number {
  const parts = parseDateParts(event.date);
  return parts ? dateSortKey(parts) : event.year * 10_000;
}
