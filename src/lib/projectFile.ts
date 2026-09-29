import { FTREE_SCHEMA, type FamilyTreeProject, type Person, type Relationship, type RelationshipKind } from "../types";

/** The only `.ftree` layout this build reads and writes. */
export const FTREE_VERSION = 1;

export function serializeProject(project: FamilyTreeProject): string {
  return JSON.stringify({ ...project, updatedAt: new Date().toISOString() }, null, 2);
}

/**
 * Parses a `.ftree` document defensively: hand-edited or partially written
 * files must not be able to crash the editor, so every field is coerced,
 * duplicates are dropped and relationships pointing at missing people are
 * discarded rather than rendered as dangling edges.
 */
export function parseProject(value: string): FamilyTreeProject {
  let parsed: unknown;
  try {
    // Windows editors routinely prepend a byte order mark, which JSON.parse rejects.
    parsed = JSON.parse(value.charCodeAt(0) === 0xfeff ? value.slice(1) : value);
  } catch {
    throw new Error("This file is not valid JSON and cannot be opened.");
  }

  if (!isRecord(parsed) || parsed.schema !== FTREE_SCHEMA || !Array.isArray(parsed.people)) {
    throw new Error("This file is not a valid Family Tree Studio .ftree project.");
  }
  if (typeof parsed.version === "number" && parsed.version > FTREE_VERSION) {
    throw new Error("This project was saved by a newer version of Family Tree Studio. Update the app to open it.");
  }
  if (parsed.version !== FTREE_VERSION) {
    throw new Error("This file is not a valid Family Tree Studio .ftree project.");
  }

  const people = dedupeById(parsed.people.filter(isRecord).map(normalizePerson));
  const knownIds = new Set(people.map((person) => person.id));
  const relationships = dedupeLinks(
    dedupeById(
      (Array.isArray(parsed.relationships) ? parsed.relationships : [])
        .filter(isRecord)
        .map(normalizeRelationship)
        .filter((relationship) => knownIds.has(relationship.from) && knownIds.has(relationship.to) && relationship.from !== relationship.to),
    ),
  );

  const now = new Date().toISOString();
  return {
    schema: FTREE_SCHEMA,
    version: FTREE_VERSION,
    id: text(parsed.id) || `project-${crypto.randomUUID()}`,
    name: text(parsed.name) || "Untitled Family Tree",
    description: text(parsed.description),
    people,
    relationships,
    settings: normalizeSettings(parsed.settings),
    createdAt: text(parsed.createdAt) || now,
    updatedAt: text(parsed.updatedAt) || now,
  };
}

export function normalizeSettings(value: unknown): FamilyTreeProject["settings"] {
  const settings = isRecord(value) ? value : {};
  return {
    compactNodes: Boolean(settings.compactNodes),
    showLinkCounts: settings.showLinkCounts !== false,
    showPhotos: settings.showPhotos !== false,
    sortByDates: settings.sortByDates !== false,
  };
}

export function safeFileName(value: string): string {
  const cleaned = value.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 80) : "family-tree";
}

function normalizePerson(value: Record<string, unknown>): Person {
  return {
    id: text(value.id) || `person-${crypto.randomUUID()}`,
    firstName: text(value.firstName),
    lastName: text(value.lastName),
    gender: value.gender === "female" ? "female" : "male",
    birthDate: text(value.birthDate),
    deathDate: text(value.deathDate),
    birthPlace: text(value.birthPlace),
    deathPlace: text(value.deathPlace),
    occupation: text(value.occupation),
    photoUrl: text(value.photoUrl),
    notes: text(value.notes),
    tags: Array.isArray(value.tags) ? value.tags.map(text).filter(Boolean) : [],
  };
}

function normalizeRelationship(value: Record<string, unknown>): Relationship {
  const type: RelationshipKind = value.type === "spouse" ? "spouse" : "parent-child";
  return {
    id: text(value.id) || `relationship-${crypto.randomUUID()}`,
    type,
    from: text(value.from),
    to: text(value.to),
    date: text(value.date),
    notes: text(value.notes),
  };
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/** Two links between the same people are the same claim; a spouse link has no direction. */
function dedupeLinks(relationships: Relationship[]): Relationship[] {
  const seen = new Set<string>();
  return relationships.filter((relationship) => {
    const ends = relationship.type === "spouse" ? [relationship.from, relationship.to].sort() : [relationship.from, relationship.to];
    const key = `${relationship.type}\u0000${ends.join("\u0000")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
