import { MarkerType, type Edge } from "@xyflow/react";
import { HANDLE } from "./handles";
import type { LayoutPoint, NodeMetrics } from "./layout";
import type { Relationship } from "../types";

/**
 * Where a family's line leaves the parents' row: from the middle of the
 * marriage line between two neighbouring spouses, or from under one card.
 */
export type FamilyAnchor = { kind: "between"; left: string; right: string } | { kind: "below"; person: string };

export interface FamilyEdgeData extends Record<string, unknown> {
  anchor: FamilyAnchor;
  /** Height of this family's horizontal rail, in flow coordinates. */
  railY: number;
  /**
   * A child with two parents has two parent-child links but one line. The
   * first link draws it; the other renders nothing, so the line is not drawn
   * twice on top of itself.
   */
  draws: boolean;
}

/** Room kept between the rails and the cards above and below, for the arrowhead. */
const RAIL_MARGIN = 20;
/** Preferred distance between two rails in the same gap. */
const RAIL_STEP = 14;
/** Two rails closer than this along the row count as overlapping. */
const RAIL_CLEARANCE = 12;

/**
 * Turns relationships into React Flow edges.
 *
 * Children are drawn as families. All the children a couple has together hang
 * from one line that drops from the middle of the couple's marriage line to a
 * horizontal rail and branches down to each child. Every family in a gap
 * between two rows gets its own rail height, so the children of one wife can
 * never be read as the children of another - a single shared rail used to make
 * a man with several wives, or an in-law's parents beside the family, look
 * like one big family.
 *
 * A spouse line is drawn straight between neighbouring cards. When another card
 * sits between the two - a man with several wives - a straight line would pass
 * behind it and read as a link to that card, so the line arches over the top.
 */
export function buildEdges(
  relationships: Relationship[],
  visibleIds: Set<string>,
  positions: Map<string, LayoutPoint>,
  metrics: NodeMetrics,
  heights: ReadonlyMap<string, { height: number }> = new Map(),
): Edge[] {
  const visible = relationships.filter((relationship) => visibleIds.has(relationship.from) && visibleIds.has(relationship.to));
  const families = familyRoutes(visible, positions, metrics, heights);

  return visible.map((relationship) =>
    relationship.type === "spouse" ? spouseEdge(relationship, positions, metrics) : parentChildEdge(relationship, families.get(relationship.id)),
  );
}

function parentChildEdge(relationship: Relationship, route: FamilyEdgeData | undefined): Edge {
  return {
    id: relationship.id,
    source: relationship.from,
    target: relationship.to,
    sourceHandle: HANDLE.childOut,
    targetHandle: HANDLE.parentIn,
    type: "family",
    data: route ?? { anchor: { kind: "below", person: relationship.from }, railY: Number.NaN, draws: true },
    className: "family-edge parent-child-edge",
    markerEnd: { type: MarkerType.ArrowClosed, color: "var(--accent)" },
    style: { stroke: "var(--accent)", strokeWidth: 2.4 },
  };
}

function spouseEdge(relationship: Relationship, positions: Map<string, LayoutPoint>, metrics: NodeMetrics): Edge {
  const first = positions.get(relationship.from);
  const second = positions.get(relationship.to);
  // Spouse links have no direction, so the left-hand card is always the source.
  const [left, right] = first && second && first.x > second.x ? [relationship.to, relationship.from] : [relationship.from, relationship.to];
  const neighbours = areNeighbours(first, second, metrics);

  return {
    id: relationship.id,
    source: left,
    target: right,
    sourceHandle: neighbours ? HANDLE.spouseRight : HANDLE.spouseTopOut,
    targetHandle: neighbours ? HANDLE.spouseLeft : HANDLE.spouseTopIn,
    type: neighbours ? "straight" : "smoothstep",
    pathOptions: neighbours ? undefined : { offset: 30, borderRadius: 16 },
    className: "family-edge spouse-edge",
    style: { stroke: "var(--rose)", strokeWidth: 2, strokeDasharray: "8 6" },
  } as Edge;
}

function areNeighbours(first: LayoutPoint | undefined, second: LayoutPoint | undefined, metrics: NodeMetrics): boolean {
  return Boolean(first && second && first.y === second.y && Math.abs(first.x - second.x) <= metrics.nodeWidth + metrics.spouseGap + 1);
}

interface Family {
  anchor: FamilyAnchor;
  anchorX: number;
  /** Top of the child row the rail feeds. */
  childTop: number;
  childXs: number[];
  /** The links drawn through this family, in project order. */
  links: Relationship[];
}

/**
 * Groups every parent-child link into the family it is drawn with and gives
 * each family a rail height. Returns the route for each link, keyed by id.
 *
 * Rails are placed in the gap between the bottom of the tallest card in the
 * row above and the top of the child row, using the cards' measured heights
 * where they are known, so a card that grew taller never hides a rail.
 */
function familyRoutes(
  relationships: Relationship[],
  positions: Map<string, LayoutPoint>,
  metrics: NodeMetrics,
  heights: ReadonlyMap<string, { height: number }>,
): Map<string, FamilyEdgeData> {
  const spouses = new Map<string, Set<string>>();
  for (const relationship of relationships) {
    if (relationship.type !== "spouse") continue;
    addTo(spouses, relationship.from, relationship.to);
    addTo(spouses, relationship.to, relationship.from);
  }

  const parentLinks = new Map<string, Relationship[]>();
  for (const relationship of relationships) {
    if (relationship.type !== "parent-child" || !positions.has(relationship.from) || !positions.has(relationship.to)) continue;
    const links = parentLinks.get(relationship.to);
    if (links) links.push(relationship);
    else parentLinks.set(relationship.to, [relationship]);
  }

  const centre = (id: string) => (positions.get(id)?.x ?? 0) + metrics.nodeWidth / 2;
  const families = new Map<string, Family>();
  const addLink = (anchor: FamilyAnchor, anchorX: number, childId: string, link: Relationship) => {
    const childTop = positions.get(childId)?.y ?? 0;
    const key = `${anchor.kind === "between" ? `${anchor.left}|${anchor.right}` : anchor.person}@${childTop}`;
    let family = families.get(key);
    if (!family) {
      family = { anchor, anchorX, childTop, childXs: [], links: [] };
      families.set(key, family);
    }
    if (!family.links.some((existing) => existing.to === childId)) family.childXs.push(centre(childId));
    family.links.push(link);
  };

  for (const [childId, links] of parentLinks) {
    const couple = links.length === 2 ? coupleAnchor(links[0] as Relationship, links[1] as Relationship, spouses, positions, metrics) : undefined;
    for (const link of links) {
      if (couple) addLink(couple.anchor, couple.x, childId, link);
      else addLink({ kind: "below", person: link.from }, centre(link.from), childId, link);
    }
  }

  const routes = new Map<string, FamilyEdgeData>();
  const gaps = new Map<number, Family[]>();
  for (const family of families.values()) {
    const gap = gaps.get(family.childTop);
    if (gap) gap.push(family);
    else gaps.set(family.childTop, [family]);
  }

  const rowBottoms = new Map<number, number>();
  for (const [id, point] of positions) {
    const bottom = point.y + (heights.get(id)?.height ?? metrics.nodeHeight);
    rowBottoms.set(point.y, Math.max(rowBottoms.get(point.y) ?? Number.NEGATIVE_INFINITY, bottom));
  }

  for (const [childTop, inGap] of gaps) {
    const rowAbove = childTop - metrics.rowSpacing;
    const band = Math.max(0, childTop - (rowBottoms.get(rowAbove) ?? rowAbove + metrics.nodeHeight));
    const levels = assignLevels(inGap);
    const count = Math.max(...levels) + 1;
    const margin = Math.min(RAIL_MARGIN, band / 4);
    const step = count > 1 ? Math.min(RAIL_STEP, Math.max(0, band - 2 * margin) / (count - 1)) : 0;
    // The rails are stacked around the middle of the gap, so a lone family's
    // rail sits exactly halfway between the rows.
    const middle = childTop - band / 2;
    inGap.forEach((family, position) => {
      const railY = middle + ((count - 1) / 2 - (levels[position] ?? 0)) * step;
      const drawn = new Set<string>();
      for (const link of family.links) {
        routes.set(link.id, { anchor: family.anchor, railY, draws: !drawn.has(link.to) });
        drawn.add(link.to);
      }
    });
  }
  return routes;
}

/**
 * Two parents share one line when they are married and sit on the same row.
 * Neighbours hang it from the middle of their marriage line. When cards sit
 * between them - a man with several wives - it hangs from under the partner
 * with fewer spouses, so each wife's children visibly come from her.
 */
function coupleAnchor(
  first: Relationship,
  second: Relationship,
  spouses: Map<string, Set<string>>,
  positions: Map<string, LayoutPoint>,
  metrics: NodeMetrics,
): { anchor: FamilyAnchor; x: number } | undefined {
  const a = first.from;
  const b = second.from;
  const pa = positions.get(a);
  const pb = positions.get(b);
  if (!pa || !pb || pa.y !== pb.y || !spouses.get(a)?.has(b)) return undefined;

  const [left, right] = pa.x <= pb.x ? [a, b] : [b, a];
  if (areNeighbours(pa, pb, metrics)) {
    const leftX = positions.get(left)?.x ?? 0;
    return { anchor: { kind: "between", left, right }, x: leftX + metrics.nodeWidth + metrics.spouseGap / 2 };
  }
  const spouseCount = (id: string) => spouses.get(id)?.size ?? 0;
  const person = spouseCount(left) < spouseCount(right) ? left : right;
  return { anchor: { kind: "below", person }, x: (positions.get(person)?.x ?? 0) + metrics.nodeWidth / 2 };
}

/**
 * Interval partitioning: sorted by where they start, each family takes the
 * lowest rail whose last occupant ends before it begins. Families that do not
 * overlap along the row share a height; overlapping ones never do.
 */
function assignLevels(families: Family[]): number[] {
  const spans = families.map((family, position) => {
    const xs = [family.anchorX, ...family.childXs];
    return { position, start: Math.min(...xs), end: Math.max(...xs) };
  });
  spans.sort((first, second) => first.start - second.start || first.end - second.end);

  const levelEnds: number[] = [];
  const levels = new Array<number>(families.length).fill(0);
  for (const span of spans) {
    let level = levelEnds.findIndex((end) => end + RAIL_CLEARANCE < span.start);
    if (level === -1) {
      level = levelEnds.length;
      levelEnds.push(span.end);
    } else {
      levelEnds[level] = span.end;
    }
    levels[span.position] = level;
  }
  return levels;
}

/**
 * The line from a family's anchor to one child: down to the rail, along it,
 * and down into the child, with rounded corners.
 */
export function familyPath(start: LayoutPoint, railY: number, end: LayoutPoint, radius = 10): string {
  const dx = end.x - start.x;
  if (Math.abs(dx) < 0.5 || !Number.isFinite(railY)) {
    if (Math.abs(dx) < 0.5) return `M ${start.x},${start.y} L ${end.x},${end.y}`;
    const middle = (start.y + end.y) / 2;
    return familyPath(start, middle, end, radius);
  }
  const direction = Math.sign(dx);
  const r = Math.max(0, Math.min(radius, Math.abs(dx) / 2, railY - start.y, end.y - railY));
  return [
    `M ${start.x},${start.y}`,
    `L ${start.x},${railY - r}`,
    `Q ${start.x},${railY} ${start.x + direction * r},${railY}`,
    `L ${end.x - direction * r},${railY}`,
    `Q ${end.x},${railY} ${end.x},${railY + r}`,
    `L ${end.x},${end.y}`,
  ].join(" ");
}

function addTo(map: Map<string, Set<string>>, key: string, value: string): void {
  const existing = map.get(key);
  if (existing) existing.add(value);
  else map.set(key, new Set([value]));
}
