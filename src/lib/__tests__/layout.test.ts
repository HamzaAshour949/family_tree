import { describe, expect, it } from "vitest";
import { flowExtentFromNodes, layoutFamilyTree } from "../layout";
import { person, relationship } from "./helpers";

const ids = (people: { id: string }[]) => new Set(people.map((item) => item.id));

describe("layoutFamilyTree", () => {
  it("returns nothing when the filters hide everyone", async () => {
    const people = [person("a")];
    expect(await layoutFamilyTree(people, [], new Set(), false)).toEqual(new Map());
  });

  it("places each generation on its own row, deeper generations lower", async () => {
    const people = [person("grandfather"), person("father"), person("child")];
    const relationships = [
      relationship("r1", "parent-child", "grandfather", "father"),
      relationship("r2", "parent-child", "father", "child"),
    ];
    const positions = await layoutFamilyTree(people, relationships, ids(people), false);

    expect(positions.size).toBe(3);
    const [grandfather, father, child] = ["grandfather", "father", "child"].map((id) => positions.get(id)?.y ?? 0);
    expect(grandfather).toBeLessThan(father);
    expect(father).toBeLessThan(child);
  });

  it("keeps siblings on one row without overlapping", async () => {
    const people = [person("parent"), person("first"), person("second")];
    const relationships = [
      relationship("r1", "parent-child", "parent", "first"),
      relationship("r2", "parent-child", "parent", "second"),
    ];
    const positions = await layoutFamilyTree(people, relationships, ids(people), false);

    expect(positions.get("first")?.y).toBe(positions.get("second")?.y);
    expect(Math.abs((positions.get("first")?.x ?? 0) - (positions.get("second")?.x ?? 0))).toBeGreaterThanOrEqual(236);
  });

  it("lays out only the visible subset", async () => {
    const people = [person("shown"), person("hidden")];
    const positions = await layoutFamilyTree(people, [], new Set(["shown"]), false);
    expect([...positions.keys()]).toEqual(["shown"]);
  });

  it("packs nodes more tightly in compact mode", async () => {
    const people = [person("parent"), person("first"), person("second")];
    const relationships = [
      relationship("r1", "parent-child", "parent", "first"),
      relationship("r2", "parent-child", "parent", "second"),
    ];
    const spread = async (compact: boolean) => {
      const positions = await layoutFamilyTree(people, relationships, ids(people), compact);
      return Math.abs((positions.get("first")?.x ?? 0) - (positions.get("second")?.x ?? 0));
    };
    expect(await spread(true)).toBeLessThan(await spread(false));
  });

  it("separates unconnected families horizontally on the same row", async () => {
    const people = [person("familyA"), person("familyB")];
    const positions = await layoutFamilyTree(people, [], ids(people), false);
    expect(positions.get("familyA")?.y).toBe(positions.get("familyB")?.y);
    expect(positions.get("familyA")?.x).not.toBe(positions.get("familyB")?.x);
  });

  it("orders spouses with the husband first and living wives before deceased ones", async () => {
    const people = [
      person("husband"),
      person("lateWife", { gender: "female", deathDate: "1990-01-01", birthDate: "1930-01-01" }),
      person("wife", { gender: "female", birthDate: "1940-01-01" }),
    ];
    const relationships = [
      relationship("r1", "spouse", "husband", "lateWife"),
      relationship("r2", "spouse", "husband", "wife"),
    ];
    const positions = await layoutFamilyTree(people, relationships, ids(people), false);
    const x = (id: string) => positions.get(id)?.x ?? 0;

    expect(x("husband")).toBeLessThan(x("wife"));
    expect(x("wife")).toBeLessThan(x("lateWife"));
  });
});

describe("flowExtentFromNodes", () => {
  it("has no extent without nodes", () => {
    expect(flowExtentFromNodes([])).toBeUndefined();
  });

  it("pads the bounding box of the placed nodes", () => {
    const extent = flowExtentFromNodes([
      { id: "a", position: { x: 0, y: 0 }, data: {} },
      { id: "b", position: { x: 100, y: 200 }, data: {} },
    ]);
    expect(extent).toEqual([
      [-420, -320],
      [800, 720],
    ]);
  });
});
