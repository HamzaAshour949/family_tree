import { describe, expect, it } from "vitest";
import { buildEdges, familyPath, type FamilyEdgeData } from "../edges";
import { HANDLE } from "../handles";
import { metricsFor, type LayoutPoint } from "../layout";
import { relationship } from "./helpers";

const metrics = metricsFor(false);
const step = metrics.nodeWidth + metrics.spouseGap;
const at = (x: number, y = 0): LayoutPoint => ({ x, y });
const all = (...ids: string[]) => new Set(ids);

describe("buildEdges", () => {
  it("connects a parent's bottom to a child's top", () => {
    const [edge] = buildEdges([relationship("r1", "parent-child", "p", "c")], all("p", "c"), new Map([["p", at(0)], ["c", at(0, 214)]]), metrics);
    expect(edge).toMatchObject({ source: "p", target: "c", sourceHandle: HANDLE.childOut, targetHandle: HANDLE.parentIn, type: "family" });
    expect(edge?.markerEnd).toBeDefined();
    expect(edge?.data).toMatchObject({ anchor: { kind: "below", person: "p" }, draws: true });
  });

  it("draws a straight line between spouses who sit side by side", () => {
    const [edge] = buildEdges([relationship("r1", "spouse", "h", "w")], all("h", "w"), new Map([["h", at(0)], ["w", at(step)]]), metrics);
    expect(edge).toMatchObject({ source: "h", target: "w", sourceHandle: HANDLE.spouseRight, targetHandle: HANDLE.spouseLeft, type: "straight" });
  });

  it("arches over the top when another card sits between the spouses", () => {
    const positions = new Map([["h", at(0)], ["w1", at(step)], ["w2", at(step * 2)]]);
    const edges = buildEdges([relationship("r1", "spouse", "h", "w1"), relationship("r2", "spouse", "h", "w2")], all("h", "w1", "w2"), positions, metrics);

    expect(edges[0]).toMatchObject({ type: "straight" });
    expect(edges[1]).toMatchObject({ source: "h", target: "w2", sourceHandle: HANDLE.spouseTopOut, targetHandle: HANDLE.spouseTopIn, type: "smoothstep" });
  });

  it("always starts a spouse line at the left-hand card", () => {
    // Stored wife-first, but the wife is drawn on the right.
    const [edge] = buildEdges([relationship("r1", "spouse", "w", "h")], all("h", "w"), new Map([["h", at(0)], ["w", at(step)]]), metrics);
    expect(edge).toMatchObject({ source: "h", target: "w" });
  });

  it("does not treat spouses on different rows as neighbours", () => {
    const [edge] = buildEdges([relationship("r1", "spouse", "a", "b")], all("a", "b"), new Map([["a", at(0)], ["b", at(step, 214)]]), metrics);
    expect(edge).toMatchObject({ type: "smoothstep" });
  });

  it("skips links whose people are filtered out", () => {
    const edges = buildEdges(
      [relationship("r1", "parent-child", "p", "c"), relationship("r2", "spouse", "p", "gone")],
      all("p", "c"),
      new Map([["p", at(0)], ["c", at(0, 214)]]),
      metrics,
    );
    expect(edges.map((edge) => edge.id)).toEqual(["r1"]);
  });

  it("uses the tighter spacing threshold in compact mode", () => {
    const compact = metricsFor(true);
    const compactStep = compact.nodeWidth + compact.spouseGap;
    const [edge] = buildEdges([relationship("r1", "spouse", "h", "w")], all("h", "w"), new Map([["h", at(0)], ["w", at(compactStep)]]), compact);
    expect(edge).toMatchObject({ type: "straight" });
  });
});

describe("family lines", () => {
  const row = metrics.rowSpacing;
  const route = (edges: ReturnType<typeof buildEdges>, id: string) => edges.find((edge) => edge.id === id)?.data as FamilyEdgeData;

  it("hangs a couple's children from the middle of their marriage line, drawn once per child", () => {
    const positions = new Map([["h", at(0)], ["w", at(step)], ["c1", at(0, row)], ["c2", at(step, row)]]);
    const edges = buildEdges(
      [
        relationship("s", "spouse", "h", "w"),
        relationship("r1", "parent-child", "h", "c1"),
        relationship("r2", "parent-child", "w", "c1"),
        relationship("r3", "parent-child", "h", "c2"),
        relationship("r4", "parent-child", "w", "c2"),
      ],
      all("h", "w", "c1", "c2"),
      positions,
      metrics,
    );
    expect(route(edges, "r1").anchor).toEqual({ kind: "between", left: "h", right: "w" });
    expect([route(edges, "r1").draws, route(edges, "r2").draws, route(edges, "r3").draws, route(edges, "r4").draws]).toEqual([true, false, true, false]);
    // One family, one rail, halfway between the rows.
    expect(route(edges, "r1").railY).toBe(route(edges, "r3").railY);
    expect(route(edges, "r1").railY).toBe(row - (metrics.rowSpacing - metrics.nodeHeight) / 2);
  });

  it("gives each wife of a man with several wives her own line and her own rail", () => {
    // Hassan | Wife one | Wife two. Wife one's children spread out to under
    // wife two, where wife two's own line comes down.
    const positions = new Map([
      ["h", at(0)],
      ["w1", at(step)],
      ["w2", at(step * 2)],
      ["a1", at(0, row)],
      ["a2", at(step * 2, row)],
      ["b", at(step * 3, row)],
    ]);
    const edges = buildEdges(
      [
        relationship("s1", "spouse", "h", "w1"),
        relationship("s2", "spouse", "h", "w2"),
        relationship("r1", "parent-child", "h", "a1"),
        relationship("r2", "parent-child", "w1", "a1"),
        relationship("r5", "parent-child", "h", "a2"),
        relationship("r6", "parent-child", "w1", "a2"),
        relationship("r3", "parent-child", "h", "b"),
        relationship("r4", "parent-child", "w2", "b"),
      ],
      all("h", "w1", "w2", "a1", "a2", "b"),
      positions,
      metrics,
    );
    expect(route(edges, "r1").anchor).toEqual({ kind: "between", left: "h", right: "w1" });
    // Wife two is not beside her husband, so her children come from her card.
    expect(route(edges, "r3").anchor).toEqual({ kind: "below", person: "w2" });
    expect(route(edges, "r3").railY).not.toBe(route(edges, "r1").railY);
  });

  it("keeps two unmarried parents as separate lines", () => {
    const positions = new Map([["f", at(0)], ["m", at(step * 2)], ["c", at(step, row)]]);
    const edges = buildEdges(
      [relationship("r1", "parent-child", "f", "c"), relationship("r2", "parent-child", "m", "c")],
      all("f", "m", "c"),
      positions,
      metrics,
    );
    expect(route(edges, "r1")).toMatchObject({ anchor: { kind: "below", person: "f" }, draws: true });
    expect(route(edges, "r2")).toMatchObject({ anchor: { kind: "below", person: "m" }, draws: true });
    expect(route(edges, "r1").railY).not.toBe(route(edges, "r2").railY);
  });

  it("lets families that do not overlap share a rail height", () => {
    const far = step * 6;
    const positions = new Map([["p", at(0)], ["q", at(far)], ["a", at(0, row)], ["b", at(step, row)], ["c", at(far, row)]]);
    const edges = buildEdges(
      [relationship("r1", "parent-child", "p", "a"), relationship("r2", "parent-child", "p", "b"), relationship("r3", "parent-child", "q", "c")],
      all("p", "q", "a", "b", "c"),
      positions,
      metrics,
    );
    expect(route(edges, "r1").railY).toBe(route(edges, "r3").railY);
  });

  it("keeps every rail inside the gap between the rows, however many families share it", () => {
    const people = Array.from({ length: 8 }, (_, index) => `p${index}`);
    const positions = new Map<string, LayoutPoint>(people.map((id, index) => [id, at(index * step)]));
    positions.set("c", at(step * 3.5, row));
    const edges = buildEdges(
      people.map((id, index) => relationship(`r${index}`, "parent-child", id, "c")),
      all(...people, "c"),
      positions,
      metrics,
    );
    for (const edge of edges) {
      const { railY } = edge.data as FamilyEdgeData;
      expect(railY).toBeGreaterThan(metrics.nodeHeight);
      expect(railY).toBeLessThan(row);
    }
    expect(new Set(edges.map((edge) => (edge.data as FamilyEdgeData).railY)).size).toBe(people.length);
  });
});

describe("familyPath", () => {
  it("drops straight down when the child is directly below", () => {
    expect(familyPath({ x: 10, y: 0 }, 50, { x: 10, y: 100 })).toBe("M 10,0 L 10,100");
  });

  it("turns along the rail with rounded corners", () => {
    expect(familyPath({ x: 0, y: 0 }, 50, { x: 100, y: 100 })).toBe("M 0,0 L 0,40 Q 0,50 10,50 L 90,50 Q 100,50 100,60 L 100,100");
  });

  it("works right to left and tightens the corners for a short hop", () => {
    expect(familyPath({ x: 10, y: 0 }, 50, { x: 0, y: 100 })).toBe("M 10,0 L 10,45 Q 10,50 5,50 L 5,50 Q 0,50 0,55 L 0,100");
  });
});
