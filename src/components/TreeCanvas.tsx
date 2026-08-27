import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { Background, Controls, MarkerType, MiniMap, Panel, Position, ReactFlow, type Edge, type Node, type NodeTypes } from "@xyflow/react";
import { Heart, MousePointer2, Plus, SlidersHorizontal, UserPlus } from "lucide-react";
import { type TranslationKey, useI18n } from "../i18n";
import { filteredPeople, relationshipCounts } from "../lib/family";
import { flowExtentFromNodes, layoutFamilyTree } from "../lib/layout";
import { useFamilyStore } from "../store/familyStore";
import { PersonNode, type PersonNodeData } from "./PersonNode";

interface TreeCanvasProps {
  exportRef: RefObject<HTMLDivElement | null>;
  onStatus: (message: string) => void;
}

const nodeTypes: NodeTypes = { person: PersonNode };

type ContextMenuState = { x: number; y: number; nodeId?: string };

export function TreeCanvas({ exportRef, onStatus }: TreeCanvasProps) {
  const { t } = useI18n();
  const addPerson = useFamilyStore((state) => state.addPerson);
  const addRelationship = useFamilyStore((state) => state.addRelationship);
  const project = useFamilyStore((state) => state.project);
  const removePerson = useFamilyStore((state) => state.removePerson);
  const selectedPersonId = useFamilyStore((state) => state.selectedPersonId);
  const searchQuery = useFamilyStore((state) => state.searchQuery);
  const genderFilter = useFamilyStore((state) => state.genderFilter);
  const selectPerson = useFamilyStore((state) => state.selectPerson);
  const toggleCompactNodes = useFamilyStore((state) => state.toggleCompactNodes);
  const toggleShowLinkCounts = useFamilyStore((state) => state.toggleShowLinkCounts);
  const toggleShowPhotos = useFamilyStore((state) => state.toggleShowPhotos);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>();
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  const visiblePeople = useMemo(() => filteredPeople(project, searchQuery, genderFilter), [genderFilter, project, searchQuery]);
  const visiblePersonIds = useMemo(() => new Set(visiblePeople.map((person) => person.id)), [visiblePeople]);

  useEffect(() => {
    let active = true;
    layoutFamilyTree(project, visiblePersonIds).then((nextPositions) => {
      if (active) setPositions(nextPositions);
    });
    return () => {
      active = false;
    };
  }, [project, visiblePersonIds]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = () => setContextMenu(undefined);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
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
          compact: project.settings.compactNodes,
          relationshipCount: Object.values(relationshipCounts(project, person.id)).reduce((total, count) => total + count, 0),
          selected: selectedPersonId === person.id,
          person,
          showLinkCounts: project.settings.showLinkCounts,
          showPhotos: project.settings.showPhotos,
          onSelect: selectPerson,
        } satisfies PersonNodeData,
      })),
    [positions, project, selectPerson, selectedPersonId, visiblePeople],
  );

  const edges = useMemo<Edge[]>(
    () =>
      project.relationships
        .filter((relationship) => visiblePersonIds.has(relationship.from) && visiblePersonIds.has(relationship.to))
        .map((relationship) => ({
          id: relationship.id,
          source: relationship.from,
          target: relationship.to,
          sourceHandle: relationship.type === "spouse" ? "spouse-source" : "child-source",
          targetHandle: relationship.type === "spouse" ? "spouse-target" : "parent-target",
          type: relationship.type === "spouse" ? "straight" : "smoothstep",
          label: relationship.type === "spouse" ? t("spouse") : undefined,
          className: relationship.type === "spouse" ? "family-edge spouse-edge" : "family-edge parent-child-edge",
          markerEnd: relationship.type === "parent-child" ? { type: MarkerType.ArrowClosed, color: "var(--accent)" } : undefined,
          style: {
            stroke: relationship.type === "spouse" ? "var(--rose)" : "var(--accent)",
            strokeWidth: relationship.type === "spouse" ? 2 : 2.4,
            strokeDasharray: relationship.type === "spouse" ? "8 6" : undefined,
          },
        })),
      [project.relationships, t, visiblePersonIds],
  );

  const contextPerson = contextMenu?.nodeId ? project.people.find((person) => person.id === contextMenu.nodeId) : undefined;

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

  function createRelatedPerson(action: "father" | "mother" | "son" | "daughter" | "spouse") {
    if (!contextPerson) return;
    const newPersonGender = action === "mother" || action === "daughter" ? "female" : "male";
    const newPersonId = addPerson({ gender: action === "spouse" ? (contextPerson.gender === "male" ? "female" : "male") : newPersonGender });
    const relationship = relationshipForAction(contextPerson.id, newPersonId, action, contextPerson.gender);
    const result = addRelationship(relationship);
    if (!result.ok) {
      removePerson(newPersonId);
      onStatus(t(result.reason as TranslationKey));
    }
    setContextMenu(undefined);
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
          onNodeClick={(_, node) => selectPerson(node.id)}
          onNodeContextMenu={openNodeContextMenu}
          onPaneClick={() => {
            setContextMenu(undefined);
            selectPerson(undefined);
          }}
          onPaneContextMenu={openPaneContextMenu}
          proOptions={{ hideAttribution: true }}
          translateExtent={flowExtentFromNodes(nodes)}
        >
          <Background color="var(--border)" gap={24} size={1} />
          <Controls className="no-export" position="bottom-left" />
          <MiniMap className="no-export" maskColor="rgba(0,0,0,0.12)" nodeColor="var(--accent)" pannable position="bottom-right" zoomable />
          <Panel className="no-export" position="top-left">
            <div className="toolbar-group">
              <button className="text-button" onClick={toggleCompactNodes} title="Toggle compact nodes" type="button">
                <SlidersHorizontal size={16} />
                {project.settings.compactNodes ? t("comfort") : t("compact")}
              </button>
              <button className="text-button" onClick={toggleShowPhotos} title={project.settings.showPhotos ? t("hidePhotos") : t("showPhotos")} type="button">
                {project.settings.showPhotos ? t("hidePhotos") : t("showPhotos")}
              </button>
              <button className="text-button" onClick={toggleShowLinkCounts} title={project.settings.showLinkCounts ? t("hideLinkCounts") : t("showLinkCounts")} type="button">
                {project.settings.showLinkCounts ? t("hideLinkCounts") : t("showLinkCounts")}
              </button>
              {selectedPersonId ? <button className="text-button" onClick={() => selectPerson(undefined)} title={t("deselect")} type="button"><MousePointer2 size={16} />{t("deselect")}</button> : null}
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

function relationshipForAction(sourcePersonId: string, newPersonId: string, action: "father" | "mother" | "son" | "daughter" | "spouse", sourceGender: "female" | "male") {
  if (action === "father" || action === "mother") return { type: "parent-child" as const, from: newPersonId, to: sourcePersonId };
  if (action === "son" || action === "daughter") return { type: "parent-child" as const, from: sourcePersonId, to: newPersonId };
  return sourceGender === "male" ? { type: "spouse" as const, from: sourcePersonId, to: newPersonId } : { type: "spouse" as const, from: newPersonId, to: sourcePersonId };
}