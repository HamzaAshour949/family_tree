import type { Node as FlowNode } from "@xyflow/react";
import { dateSortKey, parseDateParts } from "./dates";
import { generationMap } from "./family";
import type { Person, Relationship } from "../types";

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface NodeMetrics {
  nodeWidth: number;
  nodeHeight: number;
  /** Space between two spouses of the same couple. */
  spouseGap: number;
  /** Space between neighbouring couples and single people in a row. */
  unitGap: number;
  /** Distance between the tops of two consecutive generation rows. */
  rowSpacing: number;
  /** Space between unconnected families. */
  componentGap: number;
}

const UNDATED_SORT_KEY = Number.MAX_SAFE_INTEGER;
const EXTENT_PADDING = 480;
/** Alternating top-down / bottom-up refinement rounds. */
const REFINE_ROUNDS = 6;
/** Units with nothing to align to drift with their neighbours instead of resisting. */
const UNANCHORED_WEIGHT = 0.1;

const COMFORTABLE: NodeMetrics = { nodeWidth: 236, nodeHeight: 126, spouseGap: 44, unitGap: 72, rowSpacing: 214, componentGap: 170 };
const COMPACT: NodeMetrics = { nodeWidth: 196, nodeHeight: 104, spouseGap: 34, unitGap: 56, rowSpacing: 182, componentGap: 130 };

export function metricsFor(compact: boolean): NodeMetrics {
  return compact ? COMPACT : COMFORTABLE;
}

/**
 * A couple - or a person with several spouses - laid out as one block. Spouses
 * share a generation row, sit next to each other and move together.
 */
interface Unit {
  id: number;
  generation: number;
  /** Left to right: men first, then women (living before deceased). */
  members: string[];
  width: number;
  /** Left edge in the row. */
  x: number;
  /** Component the unit belongs to; assigned while walking the tree. */
  component: number;
  /** Position within its row; kept current while the rows are being ordered. */
  order: number;
}

interface FamilyIndex {
  units: Unit[];
  unitOf: Map<string, Unit>;
  parentsOf: Map<string, string[]>;
  childrenOf: Map<string, string[]>;
  memberOffset: Map<string, number>;
  /**
   * The parents a unit is drawn under. A couple has two families, and drawing it
   * under both would stretch a line across the whole tree, so it belongs to the
   * family of its first member who has one - the husband, who comes first.
   */
  primaryParents: Map<number, Set<number>>;
  /** Parents of the member the unit is drawn under, per unit id; empty for a unit with no known family. */
  primaryParentPeople: Map<number, string[]>;
}

/**
 * Places every visible person on a strict generation grid:
 *
 * 1. spouses are grouped into units that stay adjacent;
 * 2. each row is ordered by walking the family depth-first, so siblings stay
 *    together and follow the order of their parents, which keeps lines from
 *    crossing;
 * 3. units are then pulled toward the centre of their parents (top-down) and
 *    over their children (bottom-up), while a monotone regression keeps every
 *    row free of overlaps.
 *
 * It is synchronous and deterministic: the same tree always yields the same
 * picture, and it is cheap enough to run on every structural edit.
 */
export function layoutFamilyTree(
  people: Person[],
  relationships: Relationship[],
  visiblePersonIds: Set<string>,
  compact: boolean,
): Map<string, LayoutPoint> {
  const metrics = metricsFor(compact);
  const visiblePeople = people.filter((person) => visiblePersonIds.has(person.id));
  if (visiblePeople.length === 0) return new Map();

  const generations = generationMap(people, relationships);
  const directory = new Map(people.map((person) => [person.id, person]));
  const projectOrder = new Map(people.map((person, index) => [person.id, index]));
  const compare = personComparator(directory, projectOrder);

  const index = buildFamilyIndex(visiblePeople, relationships, generations, metrics, compare);
  const components = orderComponents(index, compare, projectOrder);

  const result = new Map<string, LayoutPoint>();
  const widths = components.map((rows) => placeComponent(rows, index, metrics));
  const totalWidth = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * metrics.componentGap;

  let cursor = -totalWidth / 2;
  components.forEach((rows, componentIndex) => {
    for (const [generation, units] of rows) {
      for (const unit of units) {
        unit.members.forEach((id, position) => {
          result.set(id, { x: cursor + unit.x + position * (metrics.nodeWidth + metrics.spouseGap), y: generation * metrics.rowSpacing });
        });
      }
    }
    cursor += (widths[componentIndex] ?? 0) + metrics.componentGap;
  });
  return result;
}

/**
 * Everything layout depends on, as a string: who is shown, and each person's
 * gender, birth date and whether they have died (spouses are ordered by these),
 * plus every link. Names, notes, photos and the like are deliberately absent -
 * editing them must not move anyone.
 */
export function layoutSignature(people: Person[], relationships: Relationship[], visiblePersonIds: Set<string>, compact: boolean): string {
  const parts: string[] = [compact ? "compact" : "comfortable"];
  for (const person of people) {
    const birth = parseDateParts(person.birthDate);
    parts.push(`${person.id}|${person.gender}|${birth ? dateSortKey(birth) : ""}|${person.deathDate ? 1 : 0}|${visiblePersonIds.has(person.id) ? 1 : 0}`);
  }
  for (const relationship of relationships) parts.push(`${relationship.type}|${relationship.from}|${relationship.to}`);
  return parts.join("\n");
}

let lastLayout: { signature: string; positions: Map<string, LayoutPoint> } | undefined;

/**
 * `layoutFamilyTree`, skipped when nothing that affects positions has changed.
 * The same `Map` comes back for an unchanged signature, so callers can rely on
 * its identity to avoid re-rendering.
 */
export function layoutFamilyTreeCached(
  people: Person[],
  relationships: Relationship[],
  visiblePersonIds: Set<string>,
  compact: boolean,
): Map<string, LayoutPoint> {
  const signature = layoutSignature(people, relationships, visiblePersonIds, compact);
  if (lastLayout?.signature === signature) return lastLayout.positions;
  const positions = layoutFamilyTree(people, relationships, visiblePersonIds, compact);
  lastLayout = { signature, positions };
  return positions;
}

/** Bounds the canvas so the tree cannot be panned out of sight. */
export function flowExtentFromNodes(nodes: FlowNode[], metrics: NodeMetrics = COMFORTABLE): [[number, number], [number, number]] | undefined {
  if (nodes.length === 0) return undefined;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + metrics.nodeWidth);
    maxY = Math.max(maxY, node.position.y + metrics.nodeHeight);
  }
  return [
    [minX - EXTENT_PADDING, minY - EXTENT_PADDING],
    [maxX + EXTENT_PADDING, maxY + EXTENT_PADDING],
  ];
}

// ---------------------------------------------------------------------------
// Family structure

function buildFamilyIndex(
  visiblePeople: Person[],
  relationships: Relationship[],
  generations: Map<string, number>,
  metrics: NodeMetrics,
  compare: (a: string, b: string) => number,
): FamilyIndex {
  const visibleIds = new Set(visiblePeople.map((person) => person.id));
  const visible = (relationship: Relationship) => visibleIds.has(relationship.from) && visibleIds.has(relationship.to);

  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  for (const relationship of relationships) {
    if (relationship.type !== "parent-child" || !visible(relationship)) continue;
    append(parentsOf, relationship.to, relationship.from);
    append(childrenOf, relationship.from, relationship.to);
  }

  const spouseGroups = new UnionFind(visiblePeople.map((person) => person.id));
  for (const relationship of relationships) {
    if (relationship.type !== "spouse" || !visible(relationship)) continue;
    // Spouses always share a row; a contradictory hand-edited pair stays apart.
    if ((generations.get(relationship.from) ?? 0) === (generations.get(relationship.to) ?? 0)) spouseGroups.union(relationship.from, relationship.to);
  }

  const visibleById = new Map(visiblePeople.map((person) => [person.id, person]));
  const grouped = new Map<string, string[]>();
  for (const person of visiblePeople) append(grouped, spouseGroups.find(person.id), person.id);

  const units: Unit[] = [];
  const unitOf = new Map<string, Unit>();
  const memberOffset = new Map<string, number>();
  for (const ids of grouped.values()) {
    const members = orderSpouses(ids, visibleById, compare);
    const unit: Unit = {
      id: units.length,
      generation: generations.get(members[0] ?? "") ?? 0,
      members,
      width: members.length * metrics.nodeWidth + (members.length - 1) * metrics.spouseGap,
      x: 0,
      component: -1,
      order: 0,
    };
    units.push(unit);
    members.forEach((id, position) => {
      unitOf.set(id, unit);
      memberOffset.set(id, position * (metrics.nodeWidth + metrics.spouseGap) + metrics.nodeWidth / 2);
    });
  }

  const primaryParents = new Map<number, Set<number>>();
  const primaryParentPeople = new Map<number, string[]>();
  for (const unit of units) {
    const owner = unit.members.find((id) => (parentsOf.get(id)?.length ?? 0) > 0);
    const people = owner ? (parentsOf.get(owner) ?? []) : [];
    const parents = new Set<number>();
    for (const parentId of people) {
      const parentUnit = unitOf.get(parentId);
      if (parentUnit) parents.add(parentUnit.id);
    }
    primaryParents.set(unit.id, parents);
    primaryParentPeople.set(unit.id, people);
  }

  return { units, unitOf, parentsOf, childrenOf, memberOffset, primaryParents, primaryParentPeople };
}

/** Men first, then women with living wives ahead of deceased ones. */
function orderSpouses(ids: string[], people: Map<string, Person>, compare: (a: string, b: string) => number): string[] {
  if (ids.length <= 1) return ids;
  const men = ids.filter((id) => people.get(id)?.gender === "male").sort(compare);
  const women = ids
    .filter((id) => people.get(id)?.gender !== "male")
    .sort((first, second) => Number(Boolean(people.get(first)?.deathDate)) - Number(Boolean(people.get(second)?.deathDate)) || compare(first, second));
  return [...men, ...women];
}

function personComparator(directory: Map<string, Person>, projectOrder: Map<string, number>) {
  const birthKey = (id: string) => {
    const parts = parseDateParts(directory.get(id)?.birthDate);
    return parts ? dateSortKey(parts) : UNDATED_SORT_KEY;
  };
  return (first: string, second: string) =>
    birthKey(first) - birthKey(second) || (projectOrder.get(first) ?? 0) - (projectOrder.get(second) ?? 0) || first.localeCompare(second);
}

// ---------------------------------------------------------------------------
// Ordering

type Rows = Map<number, Unit[]>;

/**
 * Walks every family depth-first and records units in the order they are met,
 * one ordered list per generation. Returns one `Rows` per connected family,
 * largest first.
 */
function orderComponents(index: FamilyIndex, compare: (a: string, b: string) => number, projectOrder: Map<string, number>): Rows[] {
  const { units, unitOf, parentsOf, childrenOf, primaryParents } = index;
  const visited = new Set<number>();
  const components: Rows[] = [];

  const childUnitsOf = (unit: Unit): Unit[] => {
    const seenHere = new Set<number>();
    const children: Array<{ unit: Unit; slot: number; person: string }> = [];
    unit.members.forEach((parentId, slot) => {
      for (const childId of childrenOf.get(parentId) ?? []) {
        const childUnit = unitOf.get(childId);
        if (!childUnit || childUnit === unit) continue;
        // Walked from the family it is drawn under, not from the spouse's.
        const primary = primaryParents.get(childUnit.id);
        if (primary && primary.size > 0 && !primary.has(unit.id)) continue;
        // A child belongs to the right-most of its parents in this unit, which
        // groups a man's children under each of his wives.
        const existing = children.find((entry) => entry.person === childId);
        if (existing) existing.slot = Math.max(existing.slot, slot);
        else children.push({ unit: childUnit, slot, person: childId });
      }
    });
    children.sort((first, second) => first.slot - second.slot || compare(first.person, second.person));
    return children.filter((entry) => !seenHere.has(entry.unit.id) && seenHere.add(entry.unit.id)).map((entry) => entry.unit);
  };

  const walk = (root: Unit, rows: Rows, componentIndex: number) => {
    // Iterative so that a very deep line of descent cannot overflow the stack.
    const stack: Unit[] = [root];
    while (stack.length > 0) {
      const unit = stack.pop() as Unit;
      if (visited.has(unit.id)) continue;
      visited.add(unit.id);
      unit.component = componentIndex;
      const row = rows.get(unit.generation);
      if (row) row.push(unit);
      else rows.set(unit.generation, [unit]);
      const children = childUnitsOf(unit);
      for (let position = children.length - 1; position >= 0; position -= 1) stack.push(children[position] as Unit);
    }
  };

  const hasVisibleParents = (unit: Unit) => unit.members.some((id) => (parentsOf.get(id)?.length ?? 0) > 0);
  const firstMember = (unit: Unit) => unit.members[0] ?? "";
  const byPosition = (first: Unit, second: Unit) =>
    first.generation - second.generation || compare(firstMember(first), firstMember(second));

  // Families start at people with no visible parents. Anything not reached from
  // one of them sits on an ancestry loop in a hand-edited file and is walked
  // afterwards so that nobody is left without a position.
  const roots = units.filter((unit) => !hasVisibleParents(unit)).sort(byPosition);
  const everyone = units.slice().sort(byPosition);

  for (const root of [...roots, ...everyone]) {
    if (visited.has(root.id)) continue;
    const rows: Rows = new Map();
    walk(root, rows, components.length);
    components.push(rows);
  }

  // Two roots that share a descendant end up in one walk only if the first
  // reaches the second's line; merge components that touch through a child.
  return mergeTouchingComponents(components, index, projectOrder);
}

/**
 * A married-in spouse's own parents form a separate root, so the walk from the
 * other family never reaches them. Joining families through such marriages
 * keeps the two lines side by side rather than spread across the canvas.
 */
function mergeTouchingComponents(components: Rows[], index: FamilyIndex, projectOrder: Map<string, number>): Rows[] {
  if (components.length <= 1) return components;
  const groups = new UnionFind(components.map((_, position) => String(position)));
  for (const unit of index.units) {
    for (const id of unit.members) {
      for (const parentId of index.parentsOf.get(id) ?? []) {
        const parentUnit = index.unitOf.get(parentId);
        if (parentUnit && parentUnit.component !== unit.component) groups.union(String(parentUnit.component), String(unit.component));
      }
    }
  }

  const merged = new Map<string, Rows>();
  components.forEach((rows, position) => {
    const key = groups.find(String(position));
    const target = merged.get(key);
    if (!target) {
      merged.set(key, rows);
      return;
    }
    for (const [generation, units] of rows) {
      const row = target.get(generation);
      if (row) row.push(...units);
      else target.set(generation, [...units]);
    }
  });

  const size = (rows: Rows) => [...rows.values()].reduce((total, units) => total + units.reduce((sum, unit) => sum + unit.members.length, 0), 0);
  const firstIndex = (rows: Rows) =>
    Math.min(...[...rows.values()].flatMap((units) => units.flatMap((unit) => unit.members.map((id) => projectOrder.get(id) ?? 0))));
  return [...merged.values()].sort((first, second) => size(second) - size(first) || firstIndex(first) - firstIndex(second));
}

// ---------------------------------------------------------------------------
// Placement

/** Assigns `unit.x` for one family and returns the width it occupies. */
function placeComponent(rows: Rows, index: FamilyIndex, metrics: NodeMetrics): number {
  const generations = [...rows.keys()].sort((first, second) => first - second);
  const ordered = generations.map((generation) => rows.get(generation) as Unit[]);
  refineOrder(ordered, index);

  // Start from a plain left-to-right packing so every row is valid.
  for (const units of ordered) {
    let cursor = 0;
    for (const unit of units) {
      unit.x = cursor;
      cursor += unit.width + metrics.unitGap;
    }
  }

  const center = (id: string) => (index.unitOf.get(id)?.x ?? 0) + (index.memberOffset.get(id) ?? 0);
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

  /** Where a unit wants to sit so its members line up with `anchors`. */
  const desiredX = (unit: Unit, anchorsOf: (id: string) => string[] | undefined): { x: number; weight: number } => {
    const wants: number[] = [];
    for (const id of unit.members) {
      const anchors = anchorsOf(id);
      if (anchors && anchors.length > 0) wants.push(mean(anchors.map(center)) - (index.memberOffset.get(id) ?? 0));
    }
    return wants.length > 0 ? { x: mean(wants), weight: 1 } : { x: unit.x, weight: UNANCHORED_WEIGHT };
  };

  const settle = (units: Unit[], anchorsOf: (id: string) => string[] | undefined) => {
    const desired = units.map((unit) => desiredX(unit, anchorsOf));
    const positions = monotonePlacement(
      desired.map((entry) => entry.x),
      desired.map((entry) => entry.weight),
      units.slice(0, -1).map((unit) => unit.width + metrics.unitGap),
    );
    units.forEach((unit, position) => {
      unit.x = positions[position] ?? unit.x;
    });
  };

  /**
   * Top-down, a couple lines up under the family it is drawn under only - the
   * other spouse's parents must not drag it across the tree. Bottom-up, every
   * member lines up over their own children.
   */
  const parentsOf = (id: string) => {
    const unit = index.unitOf.get(id);
    return unit && id === firstWithFamily(unit, index) ? index.primaryParentPeople.get(unit.id) : undefined;
  };
  const childrenOf = (id: string) => index.childrenOf.get(id);
  for (let round = 0; round < REFINE_ROUNDS; round += 1) {
    for (let row = 1; row < ordered.length; row += 1) settle(ordered[row] as Unit[], parentsOf);
    for (let row = ordered.length - 2; row >= 0; row -= 1) settle(ordered[row] as Unit[], childrenOf);
  }

  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  for (const units of ordered) {
    for (const unit of units) {
      left = Math.min(left, unit.x);
      right = Math.max(right, unit.x + unit.width);
    }
  }
  for (const units of ordered) for (const unit of units) unit.x -= left;
  return right - left;
}

/** The member a unit is drawn under: the first one with a family in the tree. */
function firstWithFamily(unit: Unit, index: FamilyIndex): string | undefined {
  return unit.members.find((id) => (index.parentsOf.get(id)?.length ?? 0) > 0);
}

/**
 * A few barycentre sweeps over the depth-first order. They move a couple to the
 * side of the family it married into - a root couple settles next to the
 * descendants it is linked to - without disturbing siblings, which share the
 * same anchors and so keep their relative order.
 *
 * Only units that have something to anchor to are reordered, and only among the
 * slots they already occupy, so everyone else stays exactly where the walk put them.
 */
function refineOrder(ordered: Unit[][], index: FamilyIndex): void {
  const renumber = () => ordered.forEach((row) => row.forEach((unit, position) => (unit.order = position)));
  /** Where a person stands in their row, as a fraction inside their unit's slot. */
  const rank = (id: string) => {
    const unit = index.unitOf.get(id);
    if (!unit) return 0;
    return unit.order + (unit.members.indexOf(id) + 1) / (unit.members.length + 1);
  };
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

  const sweep = (row: Unit[], anchorsOf: (unit: Unit) => string[]) => {
    const keyed = row.flatMap((unit, position) => {
      const anchors = anchorsOf(unit);
      return anchors.length > 0 ? [{ unit, position, key: mean(anchors.map(rank)) }] : [];
    });
    const slots = keyed.map((entry) => entry.position);
    keyed.sort((first, second) => first.key - second.key || first.position - second.position);
    keyed.forEach((entry, at) => {
      row[slots[at] as number] = entry.unit;
    });
    row.forEach((unit, position) => (unit.order = position));
  };

  // Downwards, a couple follows the family it is drawn under. Upwards, a couple
  // follows the children it is drawn over, falling back to any child it has
  // (a wife's parents settle beside the family she married into).
  const parentAnchors = (unit: Unit) => index.primaryParentPeople.get(unit.id) ?? [];
  const childAnchors = (unit: Unit) => {
    const own: string[] = [];
    const any: string[] = [];
    for (const member of unit.members) {
      for (const childId of index.childrenOf.get(member) ?? []) {
        any.push(childId);
        if (index.primaryParents.get(index.unitOf.get(childId)?.id ?? -1)?.has(unit.id)) own.push(childId);
      }
    }
    return own.length > 0 ? own : any;
  };

  renumber();
  for (let pass = 0; pass < 2; pass += 1) {
    for (let r = 1; r < ordered.length; r += 1) sweep(ordered[r] as Unit[], parentAnchors);
    for (let r = ordered.length - 2; r >= 0; r -= 1) sweep(ordered[r] as Unit[], childAnchors);
  }
}

/**
 * Least-squares placement of an ordered row: finds positions closest to
 * `desired` (weighted) such that neighbour `i + 1` sits at least
 * `separations[i]` to the right of neighbour `i`.
 *
 * Subtracting the cumulative separation turns the ordering constraint into
 * "non-decreasing", which the pool-adjacent-violators algorithm solves exactly
 * in linear time by averaging runs that would otherwise cross.
 */
export function monotonePlacement(desired: number[], weights: number[], separations: number[]): number[] {
  const offsets: number[] = [];
  let running = 0;
  desired.forEach((_, position) => {
    offsets.push(running);
    running += separations[position] ?? 0;
  });

  interface Block {
    weight: number;
    weighted: number;
    count: number;
  }
  const blocks: Block[] = [];
  desired.forEach((target, position) => {
    const weight = weights[position] ?? 1;
    blocks.push({ weight, weighted: weight * (target - (offsets[position] ?? 0)), count: 1 });
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1] as Block;
      const previous = blocks[blocks.length - 2] as Block;
      if (previous.weighted / previous.weight <= last.weighted / last.weight) break;
      previous.weight += last.weight;
      previous.weighted += last.weighted;
      previous.count += last.count;
      blocks.pop();
    }
  });

  const placed: number[] = [];
  for (const block of blocks) {
    const value = block.weighted / block.weight;
    for (let step = 0; step < block.count; step += 1) placed.push(value + (offsets[placed.length] ?? 0));
  }
  return placed;
}

// ---------------------------------------------------------------------------
// Small helpers

function append<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

class UnionFind {
  private readonly parent = new Map<string, string>();

  constructor(ids: string[]) {
    for (const id of ids) this.parent.set(id, id);
  }

  find(id: string): string {
    let root = id;
    while (this.parent.get(root) !== root) root = this.parent.get(root) ?? root;
    // Path compression keeps repeated lookups near-constant.
    let current = id;
    while (current !== root) {
      const next = this.parent.get(current) ?? root;
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  union(first: string, second: string): void {
    const a = this.find(first);
    const b = this.find(second);
    if (a !== b) this.parent.set(b, a);
  }
}
