import { describe, expect, it } from "vitest";
import { buildEdges } from "../edges";
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
    expect(edge).toMatchObject({ source: "p", target: "c", sourceHandle: HANDLE.childOut, targetHandle: HANDLE.parentIn, type: "smoothstep" });
    expect(edge?.markerEnd).toBeDefined();
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
