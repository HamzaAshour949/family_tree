import type { FamilyTreeProject, Gender, Person, Relationship } from "../types";

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

export const MAX_LIVING_WIVES = 4;

/**
 * Indexes built once per validation. The rules cross-reference ancestry
 * several times, and rebuilding the parent map inside each check turned a
 * single validation into a handful of full passes over the relationship list.
 */
interface RuleContext {
  people: Map<string, Person>;
  parentsByChild: Map<string, string[]>;
  relationships: Relationship[];
}

export function validateRelationship(project: FamilyTreeProject, relationship: Omit<Relationship, "id">): RelationshipValidationResult {
  if (relationship.from === relationship.to) return blocked("relationshipNotAllowedSelf");

  const context = buildContext(project);
  if (relationshipExists(context, relationship)) return blocked("relationshipNotAllowedDuplicate");
  return relationship.type === "parent-child"
    ? validateParentChild(context, relationship.from, relationship.to)
    : validateSpouse(context, relationship.from, relationship.to);
}

function buildContext(project: FamilyTreeProject): RuleContext {
  const parentsByChild = new Map<string, string[]>();
  for (const relationship of project.relationships) {
    if (relationship.type !== "parent-child") continue;
    const parents = parentsByChild.get(relationship.to);
    if (parents) parents.push(relationship.from);
    else parentsByChild.set(relationship.to, [relationship.from]);
  }
  return {
    people: new Map(project.people.map((person) => [person.id, person])),
    parentsByChild,
    relationships: project.relationships,
  };
}

function validateParentChild(context: RuleContext, parentId: string, childId: string): RelationshipValidationResult {
  const parent = context.people.get(parentId);
  if (!parent || !context.people.has(childId)) return blocked("relationshipNotAllowedSelf");
  if (hasLink(context, "spouse", parentId, childId)) return blocked("relationshipNotAllowedExistingParentChild");
  if (isAncestorOf(context, childId, parentId)) return blocked("relationshipNotAllowedCycle");
  if (hasParentOfGender(context, childId, parent.gender)) return blocked("relationshipNotAllowedParentGenderSlot");
  return { ok: true };
}

function validateSpouse(context: RuleContext, firstId: string, secondId: string): RelationshipValidationResult {
  const first = context.people.get(firstId);
  const second = context.people.get(secondId);
  if (!first || !second || first.gender === second.gender) return blocked("relationshipNotAllowedSpouseGender");
  if (hasLink(context, "parent-child", firstId, secondId)) return blocked("relationshipNotAllowedExistingParentChild");
  if (areCloseKin(context, firstId, secondId)) return blocked("relationshipNotAllowedCloseKin");
  if (wouldExceedLivingWifeLimit(context, first, second)) return blocked("relationshipNotAllowedAliveWivesLimit");
  return { ok: true };
}

function wouldExceedLivingWifeLimit(context: RuleContext, first: Person, second: Person): boolean {
  const man = first.gender === "male" ? first : second;
  const woman = first.gender === "female" ? first : second;
  if (man.gender !== "male" || woman.gender !== "female" || woman.deathDate) return false;

  const livingWives = new Set<string>();
  for (const relationship of context.relationships) {
    if (relationship.type !== "spouse") continue;
    if (relationship.from !== man.id && relationship.to !== man.id) continue;
    const spouse = context.people.get(relationship.from === man.id ? relationship.to : relationship.from);
    if (spouse?.gender === "female" && !spouse.deathDate) livingWives.add(spouse.id);
  }
  return livingWives.size + 1 > MAX_LIVING_WIVES;
}

function hasParentOfGender(context: RuleContext, childId: string, gender: Gender): boolean {
  return (context.parentsByChild.get(childId) ?? []).some((parentId) => context.people.get(parentId)?.gender === gender);
}

/**
 * A duplicate parent-child link is direction-sensitive (A is B's parent is not
 * the same claim as B is A's parent), while a spouse link is not.
 */
function relationshipExists(context: RuleContext, relationship: Omit<Relationship, "id">): boolean {
  return hasLink(context, relationship.type, relationship.from, relationship.to, relationship.type === "spouse");
}

function hasLink(context: RuleContext, type: Relationship["type"], firstId: string, secondId: string, symmetric = true): boolean {
  return context.relationships.some((relationship) => {
    if (relationship.type !== type) return false;
    if (relationship.from === firstId && relationship.to === secondId) return true;
    return symmetric && relationship.from === secondId && relationship.to === firstId;
  });
}

function areCloseKin(context: RuleContext, firstId: string, secondId: string): boolean {
  return (
    isAncestorOf(context, firstId, secondId) ||
    isAncestorOf(context, secondId, firstId) ||
    areSiblings(context, firstId, secondId) ||
    isAuntOrUncleOf(context, firstId, secondId) ||
    isAuntOrUncleOf(context, secondId, firstId)
  );
}

function isAncestorOf(context: RuleContext, ancestorId: string, personId: string): boolean {
  const queue = [...(context.parentsByChild.get(personId) ?? [])];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const parentId = queue.shift();
    if (!parentId || seen.has(parentId)) continue;
    if (parentId === ancestorId) return true;
    seen.add(parentId);
    queue.push(...(context.parentsByChild.get(parentId) ?? []));
  }
  return false;
}

function areSiblings(context: RuleContext, firstId: string, secondId: string): boolean {
  const firstParents = new Set(context.parentsByChild.get(firstId) ?? []);
  if (firstParents.size === 0) return false;
  return (context.parentsByChild.get(secondId) ?? []).some((parentId) => firstParents.has(parentId));
}

function isAuntOrUncleOf(context: RuleContext, candidateId: string, personId: string): boolean {
  return (context.parentsByChild.get(personId) ?? []).some((parentId) => areSiblings(context, candidateId, parentId));
}

function blocked(reason: RelationshipRuleCode): RelationshipValidationResult {
  return { ok: false, reason };
}
