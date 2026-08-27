import type { FamilyTreeProject, Relationship } from "../types";

export type RelationshipRuleCode =
  | "relationshipNotAllowedDuplicate"
  | "relationshipNotAllowedSelf"
  | "relationshipNotAllowedCycle"
  | "relationshipNotAllowedSpouseGender"
  | "relationshipNotAllowedAliveWivesLimit"
  | "relationshipNotAllowedParentGenderSlot"
  | "relationshipNotAllowedCloseKin"
  | "relationshipNotAllowedExistingParentChild";

export type RelationshipValidationResult = { ok: true } | { ok: false; reason: RelationshipRuleCode };

export function validateRelationship(project: FamilyTreeProject, relationship: Omit<Relationship, "id">): RelationshipValidationResult {
  if (relationship.from === relationship.to) return blocked("relationshipNotAllowedSelf");
  if (relationshipExists(project, relationship)) return blocked("relationshipNotAllowedDuplicate");
  if (relationship.type === "parent-child") return validateParentChild(project, relationship.from, relationship.to);
  return validateSpouse(project, relationship.from, relationship.to);
}

function validateParentChild(project: FamilyTreeProject, parentId: string, childId: string): RelationshipValidationResult {
  const parent = project.people.find((person) => person.id === parentId);
  if (!parent) return blocked("relationshipNotAllowedParentGenderSlot");
  if (hasSpouseRelationship(project, parentId, childId)) return blocked("relationshipNotAllowedExistingParentChild");
  if (isAncestorOf(project, childId, parentId)) return blocked("relationshipNotAllowedCycle");
  if (hasParentOfSameGender(project, childId, parent.gender)) return blocked("relationshipNotAllowedParentGenderSlot");
  return { ok: true };
}

function validateSpouse(project: FamilyTreeProject, firstId: string, secondId: string): RelationshipValidationResult {
  const first = project.people.find((person) => person.id === firstId);
  const second = project.people.find((person) => person.id === secondId);
  if (!first || !second || first.gender === second.gender) return blocked("relationshipNotAllowedSpouseGender");
  if (hasParentChildRelationship(project, firstId, secondId)) return blocked("relationshipNotAllowedExistingParentChild");
  if (areCloseKin(project, firstId, secondId)) return blocked("relationshipNotAllowedCloseKin");
  if (wouldExceedAliveWifeLimit(project, first.id, second.id)) return blocked("relationshipNotAllowedAliveWivesLimit");
  return { ok: true };
}

function wouldExceedAliveWifeLimit(project: FamilyTreeProject, firstId: string, secondId: string): boolean {
  const peopleById = new Map(project.people.map((person) => [person.id, person]));
  const first = peopleById.get(firstId);
  const second = peopleById.get(secondId);
  const man = first?.gender === "male" ? first : second?.gender === "male" ? second : undefined;
  const woman = first?.gender === "female" ? first : second?.gender === "female" ? second : undefined;
  if (!man || !woman || woman.deathDate) return false;
  const aliveWives = new Set<string>();
  for (const relationship of project.relationships) {
    if (relationship.type !== "spouse" || (relationship.from !== man.id && relationship.to !== man.id)) continue;
    const spouseId = relationship.from === man.id ? relationship.to : relationship.from;
    const spouse = peopleById.get(spouseId);
    if (spouse?.gender === "female" && !spouse.deathDate) aliveWives.add(spouse.id);
  }
  return aliveWives.size + 1 > 4;
}

function hasParentOfSameGender(project: FamilyTreeProject, childId: string, gender: "female" | "male"): boolean {
  const peopleById = new Map(project.people.map((person) => [person.id, person]));
  return project.relationships.some((relationship) => relationship.type === "parent-child" && relationship.to === childId && peopleById.get(relationship.from)?.gender === gender);
}

function relationshipExists(project: FamilyTreeProject, relationship: Omit<Relationship, "id">): boolean {
  return project.relationships.some(
    (item) => item.type === relationship.type && ((item.from === relationship.from && item.to === relationship.to) || (relationship.type === "spouse" && item.from === relationship.to && item.to === relationship.from)),
  );
}

function hasParentChildRelationship(project: FamilyTreeProject, firstId: string, secondId: string): boolean {
  return project.relationships.some((relationship) => relationship.type === "parent-child" && ((relationship.from === firstId && relationship.to === secondId) || (relationship.from === secondId && relationship.to === firstId)));
}

function hasSpouseRelationship(project: FamilyTreeProject, firstId: string, secondId: string): boolean {
  return project.relationships.some((relationship) => relationship.type === "spouse" && ((relationship.from === firstId && relationship.to === secondId) || (relationship.from === secondId && relationship.to === firstId)));
}

function areCloseKin(project: FamilyTreeProject, firstId: string, secondId: string): boolean {
  return isAncestorOf(project, firstId, secondId) || isAncestorOf(project, secondId, firstId) || areSiblings(project, firstId, secondId) || isAuntOrUncleOf(project, firstId, secondId) || isAuntOrUncleOf(project, secondId, firstId);
}

function isAncestorOf(project: FamilyTreeProject, ancestorId: string, personId: string): boolean {
  const parentsByChild = parentsMap(project);
  const queue = [...(parentsByChild.get(personId) ?? [])];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const parentId = queue.shift();
    if (!parentId || seen.has(parentId)) continue;
    if (parentId === ancestorId) return true;
    seen.add(parentId);
    queue.push(...(parentsByChild.get(parentId) ?? []));
  }
  return false;
}

function areSiblings(project: FamilyTreeProject, firstId: string, secondId: string): boolean {
  const parentsByChild = parentsMap(project);
  const firstParents = new Set(parentsByChild.get(firstId) ?? []);
  return (parentsByChild.get(secondId) ?? []).some((parentId) => firstParents.has(parentId));
}

function isAuntOrUncleOf(project: FamilyTreeProject, possibleAuntOrUncleId: string, personId: string): boolean {
  const parentsByChild = parentsMap(project);
  return (parentsByChild.get(personId) ?? []).some((parentId) => areSiblings(project, possibleAuntOrUncleId, parentId));
}

function parentsMap(project: FamilyTreeProject): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const relationship of project.relationships) {
    if (relationship.type !== "parent-child") continue;
    map.set(relationship.to, [...(map.get(relationship.to) ?? []), relationship.from]);
  }
  return map;
}

function blocked(reason: RelationshipRuleCode): RelationshipValidationResult {
  return { ok: false, reason };
}