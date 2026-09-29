import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { Background, Controls, MiniMap, Panel, Position, ReactFlow, useNodesInitialized, useReactFlow, type Node, type NodeChange, type NodeTypes } from "@xyflow/react";
import { FolderOpen, Heart, MousePointer2, Plus, Sparkles, SlidersHorizontal, UserPlus } from "lucide-react";
import { type TranslationKey, useI18n } from "../i18n";
import { buildEdges } from "../lib/edges";
import { filteredPeople, relationshipCountsById, totalLinks } from "../lib/family";
import { flowExtentFromNodes, layoutFamilyTreeCached, metricsFor, type LayoutPoint, type NodeMetrics } from "../lib/layout";
import { useFamilyStore, type RelativeKind } from "../store/familyStore";
import { PersonNode, type PersonNodeData } from "./PersonNode";

interface TreeCanvasProps {
  exportRef: RefObject<HTMLDivElement | null>;
  onOpen: () => void;
  onOpenSample: () => void;
  onStatus: (message: string) => void;
}

type ContextMenuState = { x: number; y: number; nodeId?: string };

const nodeTypes: NodeTypes = { person: PersonNode };
const ORIGIN: LayoutPoint = { x: 0, y: 0 };

type Measured = { width: number; height: number };
const EMPTY_MEASUREMENTS = new Map<string, Measured>();
const MENU_WIDTH = 216;
const MENU_ITEM_HEIGHT = 38;
const GENDER_COLOR = { female: "#d93f6f", male: "#2f80ed" } as const;

export function TreeCanvas({ exportRef, onOpen, onOpenSample, onStatus }: TreeCanvasProps) {
  const { t } = useI18n();
  const addPerson = useFamilyStore((state) => state.addPerson);
  const addRelative = useFamilyStore((state) => state.addRelative);
  const genderFilter = useFamilyStore((state) => state.genderFilter);
  const loadSerial = useFamilyStore((state) => state.loadSerial);
  const newPersonId = useFamilyStore((state) => state.newPersonId);
  const people = useFamilyStore((state) => state.project.people);
  const relationships = useFamilyStore((state) => state.project.relationships);
  const settings = useFamilyStore((state) => state.project.settings);
  const searchQuery = useFamilyStore((state) => state.searchQuery);
  const selectPerson = useFamilyStore((state) => state.selectPerson);
  const selectedPersonId = useFamilyStore((state) => state.selectedPersonId);
  const theme = useFamilyStore((state) => state.theme);
  const toggleCompactNodes = useFamilyStore((state) => state.toggleCompactNodes);
  const toggleShowLinkCounts = useFamilyStore((state) => state.toggleShowLinkCounts);
  const toggleShowPhotos = useFamilyStore((state) => state.toggleShowPhotos);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>();
  const [measured, setMeasured] = useState<Map<string, Measured>>(EMPTY_MEASUREMENTS);
  // Whoever was selected when the canvas appeared - for example after clicking
  // a timeline entry - is brought into view rather than lost in a full fit.
  const [selectionOnMount] = useState(selectedPersonId);

  const metrics = metricsFor(settings.compactNodes);
  const visiblePeople = useMemo(() => filteredPeople(people, searchQuery, genderFilter), [genderFilter, people, searchQuery]);
  const visiblePersonIds = useStableSet(useMemo(() => new Set(visiblePeople.map((person) => person.id)), [visiblePeople]));
  const linkCounts = useMemo(() => relationshipCountsById(people, relationships), [people, relationships]);

  /**
   * Layout is synchronous and skipped when only names, notes or photos changed
   * (see `layoutSignature`), so typing in the inspector never moves the tree.
   */
  const positions = useMemo(
    () => layoutFamilyTreeCached(people, relationships, visiblePersonIds, settings.compactNodes),
    [people, relationships, settings.compactNodes, visiblePersonIds],
  );

  /**
   * With nodes controlled from outside, React Flow reports each card's measured
   * size through this callback and expects the app to hand it back on the node.
   * Without that it never considers a node "initialised": the fit-to-view
   * waits forever and the minimap has nothing to draw.
   */
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setMeasured((previous) => {
      let next: Map<string, Measured> | undefined;
      for (const change of changes) {
        if (change.type !== "dimensions" || !change.dimensions) continue;
        const known = (next ?? previous).get(change.id);
        if (known && known.width === change.dimensions.width && known.height === change.dimensions.height) continue;
        next ??= new Map(previous);
        next.set(change.id, { width: change.dimensions.width, height: change.dimensions.height });
      }
      return next ?? previous;
    });
  }, []);

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

  // Nodes that did not change keep their identity, so a keystroke in the
  // inspector re-renders one card rather than the whole tree.
  const nodeCache = useRef(new Map<string, Node>());
  const nodes = useMemo<Node[]>(() => {
    const previous = nodeCache.current;
    const next = new Map<string, Node>();
    const built = visiblePeople.map((person) => {
      const position = positions.get(person.id) ?? ORIGIN;
      const relationshipCount = totalLinks(linkCounts.get(person.id));
      const selected = selectedPersonId === person.id;
      const size = measured.get(person.id);
      const cached = previous.get(person.id);
      const data = cached?.data as PersonNodeData | undefined;
      if (
        cached &&
        data &&
        data.person === person &&
        data.compact === settings.compactNodes &&
        data.relationshipCount === relationshipCount &&
        data.selected === selected &&
        data.showLinkCounts === settings.showLinkCounts &&
        data.showPhotos === settings.showPhotos &&
        cached.position === position &&
        cached.measured === size
      ) {
        next.set(person.id, cached);
        return cached;
      }
      const node: Node = {
        id: person.id,
        type: "person",
        position,
        measured: size,
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        data: {
          compact: settings.compactNodes,
          relationshipCount,
          selected,
          person,
          showLinkCounts: settings.showLinkCounts,
          showPhotos: settings.showPhotos,
          onSelect: selectPerson,
        } satisfies PersonNodeData,
      };
      next.set(person.id, node);
      return node;
    });
    nodeCache.current = next;
    return built;
  }, [linkCounts, measured, positions, selectPerson, selectedPersonId, settings, visiblePeople]);

  const edges = useMemo(() => buildEdges(relationships, visiblePersonIds, positions, metrics), [metrics, positions, relationships, visiblePersonIds]);
  const translateExtent = useMemo(() => flowExtentFromNodes(nodes, metrics), [metrics, nodes]);
  const contextPerson = contextMenu?.nodeId ? people.find((person) => person.id === contextMenu.nodeId) : undefined;
  const isEmpty = people.length === 0;

  function openPaneContextMenu(event: ReactMouseEvent | MouseEvent) {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  }

  function openCanvasContextMenu(event: ReactMouseEvent) {
    const target = event.target instanceof HTMLElement ? event.target : undefined;
    if (target?.closest(".react-flow__node") || target?.closest(".no-export") || target?.closest(".context-menu") || target?.closest(".welcome")) return;
    openPaneContextMenu(event);
  }

  function openNodeContextMenu(event: ReactMouseEvent, node: Node) {
    event.preventDefault();
    selectPerson(node.id);
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
  }

  function createRelatedPerson(kind: RelativeKind) {
    setContextMenu(undefined);
    if (!contextPerson) return;
    const result = addRelative(contextPerson.id, kind);
    if (!result.ok) onStatus(t(result.reason as TranslationKey));
  }

  const menuItems = contextPerson ? 5 : 1;
  const menuStyle = contextMenu
    ? {
        left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - MENU_WIDTH - 8)),
        top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - menuItems * MENU_ITEM_HEIGHT - 20)),
      }
    : undefined;

  return (
    <section className="canvas-shell" onContextMenu={openCanvasContextMenu}>
      <div className="tree-export-surface" ref={exportRef}>
        <ReactFlow
          colorMode={theme}
          deleteKeyCode={null}
          edges={edges}
          edgesFocusable={false}
          maxZoom={1.6}
          minZoom={0.1}
          nodes={nodes}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
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
          zoomOnDoubleClick={false}
        >
          <ViewportController fitKey={`${loadSerial}:${isEmpty ? "empty" : "filled"}`} focusId={newPersonId ?? selectionOnMount} metrics={metrics} positions={positions} />
          <Background color="var(--border)" gap={24} size={1} />
          <Controls className="no-export" position="bottom-left" showInteractive={false} />
          {nodes.length > 0 ? (
            <MiniMap
              className="no-export"
              nodeBorderRadius={4}
              nodeColor={(node) => GENDER_COLOR[(node.data as unknown as PersonNodeData).person.gender]}
              nodeStrokeWidth={0}
              pannable
              position="bottom-right"
              zoomable
            />
          ) : null}
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
        <div className="context-menu no-export" onContextMenu={(event) => event.preventDefault()} role="menu" style={menuStyle}>
          {contextPerson ? (
            <>
              <button onClick={() => createRelatedPerson("father")} role="menuitem" type="button"><UserPlus size={15} />{t("addFather")}</button>
              <button onClick={() => createRelatedPerson("mother")} role="menuitem" type="button"><UserPlus size={15} />{t("addMother")}</button>
              <button onClick={() => createRelatedPerson("son")} role="menuitem" type="button"><Plus size={15} />{t("addSon")}</button>
              <button onClick={() => createRelatedPerson("daughter")} role="menuitem" type="button"><Plus size={15} />{t("addDaughter")}</button>
              <button onClick={() => createRelatedPerson("spouse")} role="menuitem" type="button"><Heart size={15} />{contextPerson.gender === "male" ? t("addWife") : t("addHusband")}</button>
            </>
          ) : (
            <button onClick={() => { addPerson(); setContextMenu(undefined); }} role="menuitem" type="button"><UserPlus size={15} />{t("addNewMember")}</button>
          )}
        </div>
      ) : null}

      {isEmpty ? (
        <div className="canvas-overlay no-export">
          <div className="welcome">
            <div className="welcome-mark"><Sparkles size={22} /></div>
            <h2 className="welcome-title">{t("emptyTitle")}</h2>
            <p className="welcome-body">{t("emptyBody")}</p>
            <div className="welcome-actions">
              <button className="text-button primary-button" onClick={() => addPerson()} type="button"><UserPlus size={16} />{t("addFirstPerson")}</button>
              <button className="text-button" onClick={onOpen} type="button"><FolderOpen size={16} />{t("openProject")}</button>
              <button className="text-button" onClick={onOpenSample} type="button"><Sparkles size={16} />{t("openSample")}</button>
            </div>
          </div>
        </div>
      ) : visiblePeople.length === 0 ? (
        <div className="canvas-overlay no-export">
          <div className="empty-state">{t("noPeopleMatch")}</div>
        </div>
      ) : null}
    </section>
  );
}

interface ViewportControllerProps {
  /** Changes when the whole tree should be fitted into view again. */
  fitKey: string;
  /** A person to bring into view: a newly added one, or the selection carried over from another view. */
  focusId?: string;
  metrics: NodeMetrics;
  positions: Map<string, LayoutPoint>;
}

/**
 * Owns the camera. `fitView` on the component itself runs once, when nodes
 * first mount, which is before they have been measured - so it framed a single
 * point. Waiting for measured nodes and re-fitting per opened project gives a
 * correct first view every time.
 */
function ViewportController({ fitKey, focusId, metrics, positions }: ViewportControllerProps) {
  const { fitView, getZoom, setCenter } = useReactFlow();
  const initialized = useNodesInitialized();
  const fittedFor = useRef<string | undefined>(undefined);
  const revealed = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!initialized || fittedFor.current === fitKey) return;
    fittedFor.current = fitKey;
    void fitView({ padding: 0.16, maxZoom: 1, duration: 0 });
  }, [fitKey, fitView, initialized]);

  useEffect(() => {
    if (!focusId || !initialized || revealed.current === focusId) return;
    const point = positions.get(focusId);
    if (!point) return;
    revealed.current = focusId;
    void setCenter(point.x + metrics.nodeWidth / 2, point.y + metrics.nodeHeight / 2, { zoom: Math.min(1, Math.max(getZoom(), 0.7)), duration: 260 });
  }, [focusId, getZoom, initialized, metrics, positions, setCenter]);

  return null;
}

/** Returns the previous set while the contents are unchanged, so dependants do not re-run. */
function useStableSet(next: Set<string>): Set<string> {
  const previous = useRef(next);
  const same = previous.current.size === next.size && [...next].every((id) => previous.current.has(id));
  if (!same) previous.current = next;
  return previous.current;
}
