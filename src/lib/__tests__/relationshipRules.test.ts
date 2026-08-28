import { describe, expect, it } from "vitest";
import { MAX_LIVING_WIVES, validateRelationship } from "../relationshipRules";
import { person, project, relationship } from "./helpers";

const male = (id: string, extra = {}) => person(id, { gender: "male", ...extra });
const female = (id: string, extra = {}) => person(id, { gender: "female", ...extra });

function reasonFor(...args: Parameters<typeof validateRelationship>) {
  const result = validateRelationship(...args);
  return result.ok ? undefined : result.reason;
}

describe("validateRelationship", () => {
  it("accepts an ordinary parent-child link", () => {
    const tree = project([male("father"), male("son")]);
    expect(validateRelationship(tree, { type: "parent-child", from: "father", to: "son" })).toEqual({ ok: true });
  });

  it("rejects linking a person to themselves", () => {
    const tree = project([male("solo")]);
    expect(reasonFor(tree, { type: "parent-child", from: "solo", to: "solo" })).toBe("relationshipNotAllowedSelf");
  });

  it("rejects a duplicate parent-child link but allows the reverse to be judged on its own merits", () => {
    const tree = project([male("a"), male("b")], [relationship("r1", "parent-child", "a", "b")]);
    expect(reasonFor(tree, { type: "parent-child", from: "a", to: "b" })).toBe("relationshipNotAllowedDuplicate");
    expect(reasonFor(tree, { type: "parent-child", from: "b", to: "a" })).toBe("relationshipNotAllowedCycle");
  });

  it("treats a spouse link as the same relationship in either direction", () => {
    const tree = project([male("husband"), female("wife")], [relationship("r1", "spouse", "husband", "wife")]);
    expect(reasonFor(tree, { type: "spouse", from: "wife", to: "husband" })).toBe("relationshipNotAllowedDuplicate");
  });

  it("rejects a parent-child link that would close an ancestry loop", () => {
    const tree = project(
      [male("grandfather"), male("father"), male("son")],
      [relationship("r1", "parent-child", "grandfather", "father"), relationship("r2", "parent-child", "father", "son")],
    );
    expect(reasonFor(tree, { type: "parent-child", from: "son", to: "grandfather" })).toBe("relationshipNotAllowedCycle");
  });

  it("allows only one parent of each gender", () => {
    const tree = project([male("father"), male("stepfather"), male("son")], [relationship("r1", "parent-child", "father", "son")]);
    expect(reasonFor(tree, { type: "parent-child", from: "stepfather", to: "son" })).toBe("relationshipNotAllowedParentGenderSlot");
  });

  it("requires spouses to be of different genders", () => {
    const tree = project([male("a"), male("b")]);
    expect(reasonFor(tree, { type: "spouse", from: "a", to: "b" })).toBe("relationshipNotAllowedSpouseGender");
  });

  it("blocks a spouse link between people already linked as parent and child", () => {
    const tree = project([male("father"), female("daughter")], [relationship("r1", "parent-child", "father", "daughter")]);
    expect(reasonFor(tree, { type: "spouse", from: "father", to: "daughter" })).toBe("relationshipNotAllowedExistingParentChild");
  });

  it("blocks a parent-child link between people already married", () => {
    const tree = project([male("husband"), female("wife")], [relationship("r1", "spouse", "husband", "wife")]);
    expect(reasonFor(tree, { type: "parent-child", from: "husband", to: "wife" })).toBe("relationshipNotAllowedExistingParentChild");
  });

  it("blocks siblings, aunts/uncles and grandparents from marrying", () => {
    const tree = project(
      [male("grandfather"), male("father"), male("uncle"), female("daughter"), female("aunt")],
      [
        relationship("r1", "parent-child", "grandfather", "father"),
        relationship("r2", "parent-child", "grandfather", "uncle"),
        relationship("r3", "parent-child", "grandfather", "aunt"),
        relationship("r4", "parent-child", "father", "daughter"),
      ],
    );
    expect(reasonFor(tree, { type: "spouse", from: "father", to: "aunt" })).toBe("relationshipNotAllowedCloseKin");
    expect(reasonFor(tree, { type: "spouse", from: "uncle", to: "daughter" })).toBe("relationshipNotAllowedCloseKin");
    expect(reasonFor(tree, { type: "spouse", from: "grandfather", to: "daughter" })).toBe("relationshipNotAllowedCloseKin");
  });

  it("allows unrelated people to marry", () => {
    const tree = project([male("husband"), female("wife")]);
    expect(validateRelationship(tree, { type: "spouse", from: "husband", to: "wife" })).toEqual({ ok: true });
  });

  it(`caps a man at ${MAX_LIVING_WIVES} living wives but ignores those who have died`, () => {
    const wives = Array.from({ length: MAX_LIVING_WIVES }, (_, index) => female(`wife${index}`));
    const links = wives.map((wife, index) => relationship(`r${index}`, "spouse", "husband", wife.id));
    const atLimit = project([male("husband"), ...wives, female("candidate")], links);
    expect(reasonFor(atLimit, { type: "spouse", from: "husband", to: "candidate" })).toBe("relationshipNotAllowedAliveWivesLimit");

    const oneWidowed = project(
      [male("husband"), ...wives.map((wife, index) => (index === 0 ? female(wife.id, { deathDate: "1990-01-01" }) : wife)), female("candidate")],
      links,
    );
    expect(validateRelationship(oneWidowed, { type: "spouse", from: "husband", to: "candidate" })).toEqual({ ok: true });
  });

  it("does not count a deceased candidate against the living limit", () => {
    const wives = Array.from({ length: MAX_LIVING_WIVES }, (_, index) => female(`wife${index}`));
    const links = wives.map((wife, index) => relationship(`r${index}`, "spouse", "husband", wife.id));
    const tree = project([male("husband"), ...wives, female("candidate", { deathDate: "1980-05-05" })], links);
    expect(validateRelationship(tree, { type: "spouse", from: "husband", to: "candidate" })).toEqual({ ok: true });
  });
});
