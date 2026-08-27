import type { Node as FlowNode } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";
import { generationMap, yearFromDate } from "./family";
import type { FamilyTreeProject } from "../types";

export interface LayoutPoint {
  x: number;
  y: number;
}

const elk = new ELK();

export async function layoutFamilyTree(project: FamilyTreeProject, visiblePersonIds: Set<string>): Promise<Map<string, LayoutPoint>> {
  const nodeWidth = project.settings.compactNodes ? 196 : 236;
  const nodeHeight = project.settings.compactNodes ? 104 : 126;
  const visiblePeople = project.people.filter((person) => visiblePersonIds.has(person.id));
  const generations = generationMap(project);
  const parentEdges = project.relationships.filter((relationship) => relationship.type === "parent-child" && visiblePersonIds.has(relationship.from) && visiblePersonIds.has(relationship.to));
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
        return generationDelta || (yearFromDate(first.birthDate) ?? 9999) - (yearFromDate(second.birthDate) ?? 9999);
      })
      .map((person) => ({ id: person.id, width: nodeWidth, height: nodeHeight })),
    edges: parentEdges.map((relationship) => ({ id: relationship.id, sources: [relationship.from], targets: [relationship.to] })),
  };
  try {
    const laidOut = await elk.layout(graph);
    const elkPositions = new Map((laidOut.children ?? []).map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 } satisfies LayoutPoint]));
    return normalizeByGeneration(project, visiblePeople.map((person) => person.id), elkPositions);
  } catch {
    return normalizeByGeneration(project, visiblePeople.map((person) => person.id), new Map());
  }
}

export function flowExtentFromNodes(nodes: FlowNode[]): [[number, number], [number, number]] | undefined {
  if (nodes.length === 0) return undefined;
  const xValues = nodes.map((node) => node.position.x);
  const yValues = nodes.map((node) => node.position.y);
  return [[Math.min(...xValues) - 420, Math.min(...yValues) - 320], [Math.max(...xValues) + 700, Math.max(...yValues) + 520]];
}

function normalizeByGeneration(project: FamilyTreeProject, visiblePersonIds: string[], elkPositions: Map<string, LayoutPoint>): Map<string, LayoutPoint> {
  const nodeWidth = project.settings.compactNodes ? 196 : 236;
  const horizontalGap = project.settings.compactNodes ? 42 : 54;
  const verticalGap = project.settings.compactNodes ? 182 : 214;
  const componentGap = project.settings.compactNodes ? 130 : 170;
  const peopleById = new Map(project.people.map((person) => [person.id, person]));
  const generations = generationMap(project);
  const components = connectedComponents(project, new Set(visiblePersonIds));
  const componentWidths = components.map((component) => {
    const grouped = groupByGeneration(component, generations);
    return Math.max(
      nodeWidth,
      ...[...grouped.values()].map((ids) => ids.length * nodeWidth + Math.max(0, ids.length - 1) * horizontalGap),
    );
  });
  const totalWidth = componentWidths.reduce((total, width) => total + width, 0) + Math.max(0, componentWidths.length - 1) * componentGap;
  let componentStartX = -totalWidth / 2;
  const result = new Map<string, LayoutPoint>();

  components.forEach((component, componentIndex) => {
    const grouped = groupByGeneration(component, generations);
    const componentWidth = componentWidths[componentIndex] ?? nodeWidth;
    for (const generation of [...grouped.keys()].sort((first, second) => first - second)) {
      const ids = orderGenerationIds(project, grouped.get(generation) ?? [], peopleById, elkPositions);
      const rowWidth = ids.length * nodeWidth + Math.max(0, ids.length - 1) * horizontalGap;
      const startX = componentStartX + (componentWidth - rowWidth) / 2;
      ids.forEach((id, index) => result.set(id, { x: startX + index * (nodeWidth + horizontalGap), y: generation * verticalGap }));
    }
    componentStartX += componentWidth + componentGap;
  });

  return result;
}

function groupByGeneration(ids: string[], generations: Map<string, number>): Map<number, string[]> {
  const grouped = new Map<number, string[]>();
  for (const id of ids) grouped.set(generations.get(id) ?? 0, [...(grouped.get(generations.get(id) ?? 0) ?? []), id]);
  return grouped;
}

function orderGenerationIds(project: FamilyTreeProject, ids: string[], peopleById: Map<string, FamilyTreeProject["people"][number]>, elkPositions: Map<string, LayoutPoint>): string[] {
  const remaining = new Set(ids);
  const spouseNeighbors = new Map<string, string[]>();
  for (const relationship of project.relationships) {
    if (relationship.type !== "spouse" || !remaining.has(relationship.from) || !remaining.has(relationship.to)) continue;
    spouseNeighbors.set(relationship.from, [...(spouseNeighbors.get(relationship.from) ?? []), relationship.to]);
    spouseNeighbors.set(relationship.to, [...(spouseNeighbors.get(relationship.to) ?? []), relationship.from]);
  }

  const groups: string[][] = [];
  while (remaining.size > 0) {
    const first = remaining.values().next().value;
    if (!first) break;
    const queue = [first];
    const group: string[] = [];
    remaining.delete(first);
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      group.push(current);
      for (const next of spouseNeighbors.get(current) ?? []) {
        if (!remaining.has(next)) continue;
        remaining.delete(next);
        queue.push(next);
      }
    }
    groups.push(orderSpouseGroup(group, peopleById, elkPositions));
  }

  groups.sort((firstGroup, secondGroup) => comparePeople(firstGroup[0], secondGroup[0], peopleById, elkPositions));
  return groups.flat();
}

function orderSpouseGroup(ids: string[], peopleById: Map<string, FamilyTreeProject["people"][number]>, elkPositions: Map<string, LayoutPoint>): string[] {
  if (ids.length <= 1) return ids;
  const men = ids.filter((id) => peopleById.get(id)?.gender === "male").sort((first, second) => comparePeople(first, second, peopleById, elkPositions));
  const women = ids.filter((id) => peopleById.get(id)?.gender === "female").sort((first, second) => compareAliveThenPeople(first, second, peopleById, elkPositions));
  const others = ids.filter((id) => peopleById.get(id)?.gender !== "male" && peopleById.get(id)?.gender !== "female").sort((first, second) => comparePeople(first, second, peopleById, elkPositions));
  return [...men, ...women, ...others];
}

function compareAliveThenPeople(firstId: string, secondId: string, peopleById: Map<string, FamilyTreeProject["people"][number]>, elkPositions: Map<string, LayoutPoint>): number {
  const first = peopleById.get(firstId);
  const second = peopleById.get(secondId);
  const aliveDelta = Number(Boolean(first?.deathDate)) - Number(Boolean(second?.deathDate));
  return aliveDelta || comparePeople(firstId, secondId, peopleById, elkPositions);
}

function comparePeople(firstId: string | undefined, secondId: string | undefined, peopleById: Map<string, FamilyTreeProject["people"][number]>, elkPositions: Map<string, LayoutPoint>): number {
  const first = firstId ? peopleById.get(firstId) : undefined;
  const second = secondId ? peopleById.get(secondId) : undefined;
  const firstYear = yearFromDate(first?.birthDate) ?? 9999;
  const secondYear = yearFromDate(second?.birthDate) ?? 9999;
  return firstYear - secondYear || (elkPositions.get(firstId ?? "")?.x ?? 0) - (elkPositions.get(secondId ?? "")?.x ?? 0) || (firstId ?? "").localeCompare(secondId ?? "");
}

function connectedComponents(project: FamilyTreeProject, visibleIds: Set<string>): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const id of visibleIds) adjacency.set(id, []);
  for (const relationship of project.relationships) {
    if (!visibleIds.has(relationship.from) || !visibleIds.has(relationship.to)) continue;
    adjacency.set(relationship.from, [...(adjacency.get(relationship.from) ?? []), relationship.to]);
    adjacency.set(relationship.to, [...(adjacency.get(relationship.to) ?? []), relationship.from]);
  }

  const remaining = new Set(visibleIds);
  const components: string[][] = [];
  while (remaining.size > 0) {
    const first = remaining.values().next().value;
    if (!first) break;
    const queue = [first];
    const component: string[] = [];
    remaining.delete(first);
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      component.push(current);
      for (const next of adjacency.get(current) ?? []) {
        if (!remaining.has(next)) continue;
        remaining.delete(next);
        queue.push(next);
      }
    }
    components.push(component);
  }
  const projectOrder = new Map(project.people.map((person, index) => [person.id, index]));
  return components.sort((first, second) => second.length - first.length || Math.min(...first.map((id) => projectOrder.get(id) ?? 0)) - Math.min(...second.map((id) => projectOrder.get(id) ?? 0)));
}