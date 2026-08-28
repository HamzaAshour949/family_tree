import type { Node as FlowNode } from "@xyflow/react";
import type { ELK as ElkLayoutEngine, ElkNode } from "elkjs/lib/elk-api";
import { generationMap, yearFromDate } from "./family";
import type { Person, Relationship } from "../types";

export interface LayoutPoint {
  x: number;
  y: number;
}

interface Metrics {
  nodeWidth: number;
  nodeHeight: number;
  horizontalGap: number;
  verticalGap: number;
  componentGap: number;
}

const UNDATED_SORT_KEY = Number.MAX_SAFE_INTEGER;
const EXTENT_PADDING = { left: 420, top: 320, right: 700, bottom: 520 };

/**
 * ELK is by far the largest dependency in the app and is not needed until the
 * first layout runs, so it is loaded on demand and reused afterwards.
 */
let elkPromise: Promise<ElkLayoutEngine> | undefined;

function layoutEngine(): Promise<ElkLayoutEngine> {
  elkPromise ??= import("elkjs/lib/elk.bundled.js").then((module) => new module.default());
  return elkPromise;
}

function metricsFor(compact: boolean): Metrics {
  return compact
    ? { nodeWidth: 196, nodeHeight: 104, horizontalGap: 42, verticalGap: 182, componentGap: 130 }
    : { nodeWidth: 236, nodeHeight: 126, horizontalGap: 54, verticalGap: 214, componentGap: 170 };
}

/**
 * ELK produces a sensible left-to-right ordering, which is then snapped onto
 * strict generation rows so that every couple and sibling group lines up.
 */
export async function layoutFamilyTree(
  people: Person[],
  relationships: Relationship[],
  visiblePersonIds: Set<string>,
  compact: boolean,
): Promise<Map<string, LayoutPoint>> {
  const metrics = metricsFor(compact);
  const visiblePeople = people.filter((person) => visiblePersonIds.has(person.id));
  if (visiblePeople.length === 0) return new Map();

  const generations = generationMap(people, relationships);
  const graph: ElkNode = {
    id: "family-root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.spacing.nodeNode": "52",
      "elk.layered.spacing.nodeNodeBetweenLayers": "94",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.edgeRouting": "ORTHOGONAL",
    },
    children: visiblePeople
      .slice()
      .sort((first, second) => {
        const generationDelta = (generations.get(first.id) ?? 0) - (generations.get(second.id) ?? 0);
        return generationDelta || birthSortKey(first) - birthSortKey(second);
      })
      .map((person) => ({ id: person.id, width: metrics.nodeWidth, height: metrics.nodeHeight })),
    edges: relationships
      .filter((relationship) => relationship.type === "parent-child" && visiblePersonIds.has(relationship.from) && visiblePersonIds.has(relationship.to))
      .map((relationship) => ({ id: relationship.id, sources: [relationship.from], targets: [relationship.to] })),
  };

  let elkPositions = new Map<string, LayoutPoint>();
  try {
    const laidOut = await (await layoutEngine()).layout(graph);
    elkPositions = new Map((laidOut.children ?? []).map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]));
  } catch {
    // A layout failure is never fatal: the generation grid below still gives a
    // readable tree, just without ELK's ordering hints.
  }

  return arrangeByGeneration(people, relationships, visiblePeople, generations, elkPositions, metrics);
}

export function flowExtentFromNodes(nodes: FlowNode[]): [[number, number], [number, number]] | undefined {
  if (nodes.length === 0) return undefined;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x);
    maxY = Math.max(maxY, node.position.y);
  }
  return [
    [minX - EXTENT_PADDING.left, minY - EXTENT_PADDING.top],
    [maxX + EXTENT_PADDING.right, maxY + EXTENT_PADDING.bottom],
  ];
}

function arrangeByGeneration(
  people: Person[],
  relationships: Relationship[],
  visiblePeople: Person[],
  generations: Map<string, number>,
  elkPositions: Map<string, LayoutPoint>,
  metrics: Metrics,
): Map<string, LayoutPoint> {
  const directory = new Map(people.map((person) => [person.id, person]));
  const visibleIds = new Set(visiblePeople.map((person) => person.id));
  const components = connectedComponents(relationships, visibleIds, people);
  const rowWidth = (count: number) => count * metrics.nodeWidth + Math.max(0, count - 1) * metrics.horizontalGap;

  const grouped = components.map((component) => groupByGeneration(component, generations));
  const componentWidths = grouped.map((rows) => Math.max(metrics.nodeWidth, ...[...rows.values()].map((ids) => rowWidth(ids.length))));
  const totalWidth = componentWidths.reduce((total, width) => total + width, 0) + Math.max(0, componentWidths.length - 1) * metrics.componentGap;

  const result = new Map<string, LayoutPoint>();
  let componentStartX = -totalWidth / 2;

  grouped.forEach((rows, componentIndex) => {
    const componentWidth = componentWidths[componentIndex] ?? metrics.nodeWidth;
    for (const generation of [...rows.keys()].sort((first, second) => first - second)) {
      const ids = orderGenerationIds(relationships, rows.get(generation) ?? [], directory, elkPositions);
      const startX = componentStartX + (componentWidth - rowWidth(ids.length)) / 2;
      ids.forEach((id, index) => result.set(id, { x: startX + index * (metrics.nodeWidth + metrics.horizontalGap), y: generation * metrics.verticalGap }));
    }
    componentStartX += componentWidth + metrics.componentGap;
  });

  return result;
}

function groupByGeneration(ids: string[], generations: Map<string, number>): Map<number, string[]> {
  const grouped = new Map<number, string[]>();
  for (const id of ids) {
    const generation = generations.get(id) ?? 0;
    const row = grouped.get(generation);
    if (row) row.push(id);
    else grouped.set(generation, [id]);
  }
  return grouped;
}

/** Keeps spouses adjacent within a row, then orders the couples by birth year. */
function orderGenerationIds(
  relationships: Relationship[],
  ids: string[],
  directory: Map<string, Person>,
  elkPositions: Map<string, LayoutPoint>,
): string[] {
  const remaining = new Set(ids);
  const spouseNeighbors = adjacency(relationships.filter((relationship) => relationship.type === "spouse"), remaining);

  const groups: string[][] = [];
  while (remaining.size > 0) {
    const first = remaining.values().next().value;
    if (!first) break;
    groups.push(orderSpouseGroup(collectComponent(first, remaining, spouseNeighbors), directory, elkPositions));
  }

  groups.sort((firstGroup, secondGroup) => comparePeople(firstGroup[0], secondGroup[0], directory, elkPositions));
  return groups.flat();
}

function orderSpouseGroup(ids: string[], directory: Map<string, Person>, elkPositions: Map<string, LayoutPoint>): string[] {
  if (ids.length <= 1) return ids;
  const men = ids.filter((id) => directory.get(id)?.gender === "male").sort((first, second) => comparePeople(first, second, directory, elkPositions));
  const women = ids.filter((id) => directory.get(id)?.gender === "female").sort((first, second) => compareAliveThenPeople(first, second, directory, elkPositions));
  return [...men, ...women];
}

function compareAliveThenPeople(firstId: string, secondId: string, directory: Map<string, Person>, elkPositions: Map<string, LayoutPoint>): number {
  const aliveDelta = Number(Boolean(directory.get(firstId)?.deathDate)) - Number(Boolean(directory.get(secondId)?.deathDate));
  return aliveDelta || comparePeople(firstId, secondId, directory, elkPositions);
}

function comparePeople(firstId: string | undefined, secondId: string | undefined, directory: Map<string, Person>, elkPositions: Map<string, LayoutPoint>): number {
  const first = firstId ? directory.get(firstId) : undefined;
  const second = secondId ? directory.get(secondId) : undefined;
  const byBirth = birthSortKey(first) - birthSortKey(second);
  if (byBirth !== 0) return byBirth;
  const byElk = (elkPositions.get(firstId ?? "")?.x ?? 0) - (elkPositions.get(secondId ?? "")?.x ?? 0);
  return byElk || (firstId ?? "").localeCompare(secondId ?? "");
}

function birthSortKey(person: Person | undefined): number {
  return yearFromDate(person?.birthDate) ?? UNDATED_SORT_KEY;
}

function connectedComponents(relationships: Relationship[], visibleIds: Set<string>, people: Person[]): string[][] {
  const neighbors = adjacency(relationships, visibleIds);
  const remaining = new Set(visibleIds);
  const components: string[][] = [];
  while (remaining.size > 0) {
    const first = remaining.values().next().value;
    if (!first) break;
    components.push(collectComponent(first, remaining, neighbors));
  }

  const projectOrder = new Map(people.map((person, index) => [person.id, index]));
  const firstIndex = (component: string[]) => Math.min(...component.map((id) => projectOrder.get(id) ?? 0));
  return components.sort((first, second) => second.length - first.length || firstIndex(first) - firstIndex(second));
}

function adjacency(relationships: Relationship[], ids: Set<string>): Map<string, string[]> {
  const neighbors = new Map<string, string[]>();
  for (const relationship of relationships) {
    if (!ids.has(relationship.from) || !ids.has(relationship.to)) continue;
    appendNeighbor(neighbors, relationship.from, relationship.to);
    appendNeighbor(neighbors, relationship.to, relationship.from);
  }
  return neighbors;
}

function appendNeighbor(neighbors: Map<string, string[]>, from: string, to: string): void {
  const existing = neighbors.get(from);
  if (existing) existing.push(to);
  else neighbors.set(from, [to]);
}

/** Breadth-first sweep that consumes its seeds from `remaining`. */
function collectComponent(start: string, remaining: Set<string>, neighbors: Map<string, string[]>): string[] {
  const queue = [start];
  const component: string[] = [];
  remaining.delete(start);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    component.push(current);
    for (const next of neighbors.get(current) ?? []) {
      if (!remaining.delete(next)) continue;
      queue.push(next);
    }
  }
  return component;
}
