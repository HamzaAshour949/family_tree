import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { Background, Controls, MarkerType, MiniMap, Panel, Position, ReactFlow, type Edge, type Node, type NodeTypes } from "@xyflow/react";
import { Heart, MousePointer2, Plus, SlidersHorizontal, UserPlus } from "lucide-react";
import { type TranslationKey, useI18n } from "../i18n";
import { filteredPeople, relationshipCountsById, totalLinks } from "../lib/family";
import { flowExtentFromNodes, layoutFamilyTree, type LayoutPoint } from "../lib/layout";
import { useFamilyStore } from "../store/familyStore";
import { PersonNode, type PersonNodeData } from "./PersonNode";
import type { Gender, Relationship } from "../types";

interface TreeCanvasProps {
  exportRef: RefObject<HTMLDivElement | null>;
  onStatus: (message: string) => void;
}

type RelativeAction = "father" | "mother" | "son" | "daughter" | "spouse";
type ContextMenuState = { x: number; y: number; nodeId?: string };

const nodeTypes: NodeTypes = { person: PersonNode };
const EMPTY_POSITIONS: Map<string, LayoutPoint> = new Map();

export function TreeCanvas({ exportRef, onStatus }: TreeCanvasProps) {
  const { t } = useI18n();
  const addPerson = useFamilyStore((state) => state.addPerson);
  const addRelationship = useFamilyStore((state) => state.addRelationship);
  const genderFilter = useFamilyStore((state) => state.genderFilter);
  const people = useFamilyStore((state) => state.project.people);
  const relationships = useFamilyStore((state) => state.project.relationships);
  const settings = useFamilyStore((state) => state.project.settings);
  const searchQuery = useFamilyStore((state) => state.searchQuery);
  const selectPerson = useFamilyStore((state) => state.selectPerson);
  const selectedPersonId = useFamilyStore((state) => state.selectedPersonId);
  const toggleCompactNodes = useFamilyStore((state) => state.toggleCompactNodes);
  const toggleShowLinkCounts = useFamilyStore((state) => state.toggleShowLinkCounts);
  const toggleShowPhotos = useFamilyStore((state) => state.toggleShowPhotos);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>();
  const [positions, setPositions] = useState(EMPTY_POSITIONS);

  const visiblePeople = useMemo(() => filteredPeople(people, searchQuery, genderFilter), [genderFilter, people, searchQuery]);
  const visiblePersonIds = useMemo(() => new Set(visiblePeople.map((person) => person.id)), [visiblePeople]);
  const linkCounts = useMemo(() => relationshipCountsById(people, relationships), [people, relationships]);

  /**
   * Layout only depends on the graph shape and node size, so it is keyed on
   * those alone. Typing in an unrelated field no longer triggers a full ELK
   * pass on every keystroke.
   */
  useEffect(() => {
    let active = true;
    void layoutFamilyTree(people, relationships, visiblePersonIds, settings.compactNodes).then((nextPositions) => {
      if (active) setPositions(nextPositions);
    });
    return () => {
      active = false;
    };
  }, [people, relationships, settings.compactNodes, visiblePersonIds]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = () => setContextMenu(undefined);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  const nodes = useMemo<Node[]>(
    () =>
      visiblePeople.map((person) => ({
        id: person.id,
        type: "person",
        position: positions.get(person.id) ?? { x: 0, y: 0 },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        data: {
          compact: settings.compactNodes,
          relationshipCount: totalLinks(linkCounts.get(person.id)),
          selected: selectedPersonId === person.id,
          person,
          showLinkCounts: settings.showLinkCounts,
          showPhotos: settings.showPhotos,
          onSelect: selectPerson,
        } satisfies PersonNodeData,
      })),
    [linkCounts, positions, selectPerson, selectedPersonId, settings, visiblePeople],
  );

  const edges = useMemo<Edge[]>(
    () =>
      relationships
        .filter((relationship) => visiblePersonIds.has(relationship.from) && visiblePersonIds.has(relationship.to))
        .map((relationship) => {
          const isSpouse = relationship.type === "spouse";
          return {
            id: relationship.id,
            source: relationship.from,
            target: relationship.to,
            sourceHandle: isSpouse ? "spouse-source" : "child-source",
            targetHandle: isSpouse ? "spouse-target" : "parent-target",
            type: isSpouse ? "straight" : "smoothstep",
            label: isSpouse ? t("spouse") : undefined,
            className: isSpouse ? "family-edge spouse-edge" : "family-edge parent-child-edge",
            markerEnd: isSpouse ? undefined : { type: MarkerType.ArrowClosed, color: "var(--accent)" },
            style: {
              stroke: isSpouse ? "var(--rose)" : "var(--accent)",
              strokeWidth: isSpouse ? 2 : 2.4,
              strokeDasharray: isSpouse ? "8 6" : undefined,
            },
          };
        }),
    [relationships, t, visiblePersonIds],
  );

  const translateExtent = useMemo(() => flowExtentFromNodes(nodes), [nodes]);
  const contextPerson = contextMenu?.nodeId ? people.find((person) => person.id === contextMenu.nodeId) : undefined;

  function openPaneContextMenu(event: ReactMouseEvent | MouseEvent) {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  }

  function openCanvasContextMenu(event: ReactMouseEvent) {
    const target = event.target instanceof HTMLElement ? event.target : undefined;
    if (target?.closest(".react-flow__node") || target?.closest(".no-export") || target?.closest(".context-menu")) return;
    openPaneContextMenu(event);
  }

  function openNodeContextMenu(event: ReactMouseEvent, node: Node) {
    event.preventDefault();
    selectPerson(node.id);
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
  }

  function createStandalonePerson() {
    addPerson();
    setContextMenu(undefined);
  }

  /**
   * Creates the relative only after the link has been accepted, so a rejected
   * relationship never leaves an orphan profile behind or drops the selection.
   */
  function createRelatedPerson(action: RelativeAction) {
    setContextMenu(undefined);
    if (!contextPerson) return;

    const newPersonId = addPerson({ gender: genderForAction(action, contextPerson.gender) });
    const result = addRelationship(relationshipForAction(contextPerson.id, newPersonId, action, contextPerson.gender));
    if (result.ok) return;

    useFamilyStore.getState().removePerson(newPersonId);
    selectPerson(contextPerson.id);
    onStatus(t(result.reason as TranslationKey));
  }

  return (
    <section className="canvas-shell" onContextMenu={openCanvasContextMenu}>
      <div className="tree-export-surface" ref={exportRef}>
        <ReactFlow
          colorMode="system"
          edges={edges}
          fitView
          maxZoom={1.4}
          minZoom={0.18}
          nodes={nodes}
          nodeTypes={nodeTypes}
          // Positions come from the automatic layout, so dragging a node would
          // silently snap back on the next relayout.
          nodesDraggable={false}
          nodesConnectable={false}
          onNodeClick={(_, node) => selectPerson(node.id)}
          onNodeContextMenu={openNodeContextMenu}
          onPaneClick={() => {
            setContextMenu(undefined);
            selectPerson(undefined);
          }}
          onPaneContextMenu={openPaneContextMenu}
          proOptions={{ hideAttribution: true }}
          translateExtent={translateExtent}
        >
          <Background color="var(--border)" gap={24} size={1} />
          <Controls className="no-export" position="bottom-left" showInteractive={false} />
          <MiniMap className="no-export" maskColor="rgba(0,0,0,0.12)" nodeColor="var(--accent)" pannable position="bottom-right" zoomable />
          <Panel className="no-export" position="top-left">
            <div className="toolbar-group">
              <button className="text-button" onClick={toggleCompactNodes} title={t("toggleDensity")} type="button">
                <SlidersHorizontal size={16} />
                {settings.compactNodes ? t("comfort") : t("compact")}
              </button>
              <button className="text-button" onClick={toggleShowPhotos} type="button">
                {settings.showPhotos ? t("hidePhotos") : t("showPhotos")}
              </button>
              <button className="text-button" onClick={toggleShowLinkCounts} type="button">
                {settings.showLinkCounts ? t("hideLinkCounts") : t("showLinkCounts")}
              </button>
              {selectedPersonId ? (
                <button className="text-button" onClick={() => selectPerson(undefined)} title={t("deselect")} type="button">
                  <MousePointer2 size={16} />
                  {t("deselect")}
                </button>
              ) : null}
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {contextMenu ? (
        <div className="context-menu no-export" onContextMenu={(event) => event.preventDefault()} style={{ left: contextMenu.x, top: contextMenu.y }}>
          {contextPerson ? (
            <>
              <button onClick={() => createRelatedPerson("father")} type="button"><UserPlus size={15} />{t("addFather")}</button>
              <button onClick={() => createRelatedPerson("mother")} type="button"><UserPlus size={15} />{t("addMother")}</button>
              <button onClick={() => createRelatedPerson("son")} type="button"><Plus size={15} />{t("addSon")}</button>
              <button onClick={() => createRelatedPerson("daughter")} type="button"><Plus size={15} />{t("addDaughter")}</button>
              <button onClick={() => createRelatedPerson("spouse")} type="button"><Heart size={15} />{contextPerson.gender === "male" ? t("addWife") : t("addHusband")}</button>
            </>
          ) : (
            <button onClick={createStandalonePerson} type="button"><UserPlus size={15} />{t("addNewMember")}</button>
          )}
        </div>
      ) : null}

      {visiblePeople.length === 0 ? <div className="empty-state">{t("noPeopleMatch")}</div> : null}
    </section>
  );
}

function genderForAction(action: RelativeAction, sourceGender: Gender): Gender {
  if (action === "spouse") return sourceGender === "male" ? "female" : "male";
  return action === "mother" || action === "daughter" ? "female" : "male";
}

function relationshipForAction(sourcePersonId: string, newPersonId: string, action: RelativeAction, sourceGender: Gender): Omit<Relationship, "id"> {
  if (action === "father" || action === "mother") return { type: "parent-child", from: newPersonId, to: sourcePersonId };
  if (action === "son" || action === "daughter") return { type: "parent-child", from: sourcePersonId, to: newPersonId };
  return sourceGender === "male" ? { type: "spouse", from: sourcePersonId, to: newPersonId } : { type: "spouse", from: newPersonId, to: sourcePersonId };
}
