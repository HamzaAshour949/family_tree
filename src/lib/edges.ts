import { MarkerType, type Edge } from "@xyflow/react";
import { HANDLE } from "./handles";
import type { LayoutPoint, NodeMetrics } from "./layout";
import type { Relationship } from "../types";

/**
 * Turns relationships into React Flow edges.
 *
 * A spouse line is drawn straight between neighbouring cards. When another card
 * sits between the two - a man with several wives - a straight line would pass
 * behind it and read as a link to that card, so the line arches over the top.
 */
export function buildEdges(relationships: Relationship[], visibleIds: Set<string>, positions: Map<string, LayoutPoint>, metrics: NodeMetrics): Edge[] {
  const edges: Edge[] = [];
  for (const relationship of relationships) {
    if (!visibleIds.has(relationship.from) || !visibleIds.has(relationship.to)) continue;
    edges.push(relationship.type === "spouse" ? spouseEdge(relationship, positions, metrics) : parentChildEdge(relationship));
  }
  return edges;
}

function parentChildEdge(relationship: Relationship): Edge {
  return {
    id: relationship.id,
    source: relationship.from,
    target: relationship.to,
    sourceHandle: HANDLE.childOut,
    targetHandle: HANDLE.parentIn,
    type: "smoothstep",
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
  const neighbours = Boolean(first && second && first.y === second.y && Math.abs(first.x - second.x) <= metrics.nodeWidth + metrics.spouseGap + 1);

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
