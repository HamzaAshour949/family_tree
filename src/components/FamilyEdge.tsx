import { memo } from "react";
import { BaseEdge, useInternalNode, type EdgeProps, type InternalNode } from "@xyflow/react";
import { familyPath, type FamilyEdgeData } from "../lib/edges";
import { HANDLE } from "../lib/handles";
import type { LayoutPoint } from "../lib/layout";

/**
 * One child's branch of a family line: from the family's anchor down to its
 * rail, along it, and into the child. The anchor is read from the cards'
 * measured handles, so the line starts exactly on the marriage line or on the
 * card's edge whatever height the cards turn out to be.
 */
export const FamilyEdge = memo(({ id, sourceX, sourceY, targetX, targetY, data, markerEnd, style }: EdgeProps) => {
  const route = data as FamilyEdgeData;
  const first = useInternalNode(route.anchor.kind === "between" ? route.anchor.left : route.anchor.person);
  const second = useInternalNode(route.anchor.kind === "between" ? route.anchor.right : route.anchor.person);
  if (!route.draws) return null;

  const start = anchorPoint(route, first, second) ?? { x: sourceX, y: sourceY };
  return <BaseEdge id={id} markerEnd={markerEnd} path={familyPath(start, route.railY, { x: targetX, y: targetY })} style={style} />;
});

FamilyEdge.displayName = "FamilyEdge";

function anchorPoint(route: FamilyEdgeData, first: InternalNode | undefined, second: InternalNode | undefined): LayoutPoint | undefined {
  if (route.anchor.kind === "below") return handleCentre(first, HANDLE.childOut);
  // The marriage line runs between these two handles.
  const left = handleCentre(first, HANDLE.spouseRight);
  const right = handleCentre(second, HANDLE.spouseLeft);
  return left && right ? { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 } : undefined;
}

function handleCentre(node: InternalNode | undefined, handleId: string): LayoutPoint | undefined {
  const bounds = node?.internals.handleBounds;
  const handle = [...(bounds?.source ?? []), ...(bounds?.target ?? [])].find((candidate) => candidate.id === handleId);
  if (!node || !handle) return undefined;
  const origin = node.internals.positionAbsolute;
  return { x: origin.x + handle.x + handle.width / 2, y: origin.y + handle.y + handle.height / 2 };
}
