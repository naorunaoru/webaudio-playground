import type React from "react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./GraphEditor.module.css";
import type {
  ConnectionEndpoint,
  GraphConnection,
  GraphNode,
  PortKind,
} from "./types";
import { NODE_HEADER_HEIGHT, PORT_ROW_HEIGHT } from "./layout";
import { bezierPath } from "./coordinates";
import { canConnect, portColumnIndex, portMetaForNode } from "./graphUtils";
import { useNodeWidths } from "./hooks";
import {
  DragInteractionLayer,
  GraphConnectionPath,
  GraphHUD,
  GraphNodeCardContainer,
} from "./components";
import type { DragInteractionLayerHandle } from "./components";
import { createId } from "./id";
import {
  useGraphStore,
  useGraphMeta,
  useStructuralState,
} from "@state";
import { useSelection, useMidi } from "@contexts";

export type GraphEditorProps = Readonly<{
  audioState: AudioContextState | "off";
}>;

export type GraphEditorHandle = Readonly<{
  focus: () => void;
}>;

export const GraphEditor = forwardRef<GraphEditorHandle, GraphEditorProps>(
  function GraphEditor({ audioState }, ref) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const scrollRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    const {
      store,
      moveNode,
      deleteNode,
      patchNode,
      addConnection,
      deleteConnection,
      setZOrder,
      startBatch,
      endBatch,
    } = useGraphStore();

    const { uiState, setViewportState } = useGraphMeta();

    // Structural state — rerenders on node add/remove, connections, positions, z-order
    const structural = useStructuralState();

    const [status, setStatus] = useState<string | null>(null);

    const { selected, selectNodes, selectConnection, deselect } =
      useSelection();
    const { emitMidi } = useMidi();

    const { nodeWidths, registerNodeEl } = useNodeWidths();

    const dragLayerRef = useRef<DragInteractionLayerHandle>(null);

    const handleMoveNodes = useCallback(
      (moves: Map<string, { x: number; y: number }>) => {
        for (const [nodeId, pos] of moves) {
          moveNode(nodeId, pos.x, pos.y);
        }
      },
      [moveNode]
    );

    const handleConnect = useCallback(
      (from: ConnectionEndpoint, to: ConnectionEndpoint) => {
        const graph = store.getFullGraphSnapshot();
        if (!graph) return;

        const res = canConnect(graph, from, to);
        if (!res.ok) {
          setStatus(`Cannot connect (${res.reason})`);
          return;
        }

        const conn: GraphConnection = {
          id: createId("c"),
          kind: res.kind,
          from,
          to,
        };

        addConnection({
          id: conn.id,
          kind: conn.kind,
          from: conn.from,
          to: conn.to,
        });

        setStatus(`Connected ${res.kind}`);
      },
      [store, addConnection]
    );

    // Scroll tracking
    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;

      const onScroll = () => {
        scrollRef.current = { x: root.scrollLeft, y: root.scrollTop };
      };

      onScroll();
      root.addEventListener("scroll", onScroll, { passive: true });
      return () => root.removeEventListener("scroll", onScroll);
    }, []);

    // Save viewport position on scrollend
    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;

      const onScrollEnd = () => {
        const viewportWidth = root.clientWidth;
        const viewportHeight = root.clientHeight;

        const centerX = root.scrollLeft + viewportWidth / 2;
        const centerY = root.scrollTop + viewportHeight / 2;

        setViewportState({ centerX, centerY });
      };

      root.addEventListener("scrollend", onScrollEnd, { passive: true });
      return () => root.removeEventListener("scrollend", onScrollEnd);
    }, [setViewportState]);

    // Restore viewport position on initial load
    const hasRestoredViewport = useRef(false);
    useEffect(() => {
      if (
        hasRestoredViewport.current ||
        !store.isInitialized() ||
        !rootRef.current
      )
        return;

      const viewport = uiState.viewport;
      if (!viewport) {
        hasRestoredViewport.current = true;
        return;
      }

      const { centerX, centerY } = viewport;
      const viewportWidth = rootRef.current.clientWidth;
      const viewportHeight = rootRef.current.clientHeight;

      const scrollX = centerX - viewportWidth / 2;
      const scrollY = centerY - viewportHeight / 2;

      rootRef.current.scrollLeft = Math.max(0, scrollX);
      rootRef.current.scrollTop = Math.max(0, scrollY);

      hasRestoredViewport.current = true;
    }, [structural, uiState.viewport, store]);

    // Imperative handle for parent
    useImperativeHandle(
      ref,
      () => ({
        focus: () => rootRef.current?.focus(),
      }),
      []
    );

    // Auto-clear status
    useEffect(() => {
      if (!status) return;
      const t = window.setTimeout(() => setStatus(null), 2000);
      return () => window.clearTimeout(t);
    }, [status]);

    // Build connection render cache from structural state
    const renderCache = useMemo(() => {
      const { connections, nodeIds } = structural;

      // Compute connected ports per node
      const connectedPortsByNode = new Map<string, Set<string>>();
      for (const conn of connections) {
        if (!connectedPortsByNode.has(conn.from.nodeId)) {
          connectedPortsByNode.set(conn.from.nodeId, new Set());
        }
        connectedPortsByNode.get(conn.from.nodeId)!.add(conn.from.portId);

        if (!connectedPortsByNode.has(conn.to.nodeId)) {
          connectedPortsByNode.set(conn.to.nodeId, new Set());
        }
        connectedPortsByNode.get(conn.to.nodeId)!.add(conn.to.portId);
      }

      // Build node info needed for connection path calculation
      const nodeById = new Map<
        string,
        { node: GraphNode; ports: ReturnType<typeof portMetaForNode> }
      >();
      for (const nodeId of nodeIds) {
        const node = store.getNode(nodeId);
        if (node) {
          nodeById.set(nodeId, { node, ports: portMetaForNode(node) });
        }
      }

      const portCenter = (
        node: GraphNode,
        port: { direction: "in" | "out" },
        portIdx: number
      ) => {
        const width = nodeWidths[node.id] ?? 240;
        let x = port.direction === "in" ? node.x : node.x + width;
        x += 1;
        let y =
          node.y +
          NODE_HEADER_HEIGHT +
          portIdx * PORT_ROW_HEIGHT +
          PORT_ROW_HEIGHT / 2;
        y += 1;
        return { x, y };
      };

      const connectionPaths = connections
        .map((c) => {
          const fromEntry = nodeById.get(c.from.nodeId);
          const toEntry = nodeById.get(c.to.nodeId);
          if (!fromEntry || !toEntry) return null;

          const fromPort = fromEntry.ports.find(
            (p) => p.id === c.from.portId
          );
          const toPort = toEntry.ports.find((p) => p.id === c.to.portId);
          if (!fromPort || !toPort) return null;

          const fromColIdx = portColumnIndex(fromEntry.ports, c.from.portId);
          const toColIdx = portColumnIndex(toEntry.ports, c.to.portId);

          const fp1 = portCenter(
            fromEntry.node,
            fromPort as any,
            fromColIdx
          );
          const fp2 = portCenter(toEntry.node, toPort as any, toColIdx);
          return {
            connection: c,
            d: bezierPath(fp1.x, fp1.y, fp2.x, fp2.y),
          };
        })
        .filter((v): v is NonNullable<typeof v> => v != null);

      return { connectionPaths, connectedPortsByNode };
    }, [structural, nodeWidths, store]);

    const worldSize = useMemo(() => {
      const { nodeIds } = structural;
      if (nodeIds.length === 0) return { width: 2400, height: 1600 };

      let maxX = 0;
      let maxY = 0;
      for (const nodeId of nodeIds) {
        const node = store.getNode(nodeId);
        if (node) {
          maxX = Math.max(maxX, node.x + (nodeWidths[node.id] ?? 240));
          maxY = Math.max(maxY, node.y);
        }
      }
      return {
        width: Math.max(2400, Math.ceil(maxX + 1200)),
        height: Math.max(1600, Math.ceil(maxY + 1200)),
      };
    }, [structural, nodeWidths, store]);

    const handlePatchNode = useCallback(
      (nodeId: string, patch: Partial<any>) => {
        patchNode(nodeId, patch as Record<string, unknown>);
      },
      [patchNode]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Backspace" || e.key === "Delete") {
          if (selected.type === "nodes") {
            for (const nodeId of selected.nodeIds) {
              deleteNode(nodeId);
            }
            deselect();
            return;
          }
          if (selected.type === "connection") {
            deleteConnection(selected.connectionId);
            deselect();
          }
        }
        if (e.key === "Escape") {
          dragLayerRef.current?.endDrag();
          deselect();
        }
      },
      [selected, deleteNode, deleteConnection, deselect]
    );

    const handleSelectNode = useCallback(
      (nodeId: string) => {
        const isAlreadySelected =
          selected.type === "nodes" && selected.nodeIds.has(nodeId);

        if (!isAlreadySelected) {
          selectNodes(nodeId);
        }

        const currentZ = structural.nodeZOrder;
        const zValues = Object.values(currentZ);
        const maxZ = zValues.length > 0 ? Math.max(...zValues) : 0;
        const nodeZ = currentZ[nodeId];

        if (nodeZ !== undefined && nodeZ === maxZ) {
          return;
        }

        let newZ = maxZ + 1;

        if (maxZ > structural.nodeIds.length * 2) {
          const sorted = Object.entries(currentZ)
            .filter(([id]) => id !== nodeId)
            .sort((a, b) => a[1] - b[1]);
          newZ = sorted.length + 1;
        }

        setZOrder(nodeId, newZ);
      },
      [structural, selected, setZOrder, selectNodes]
    );

    const handleSelectConnection = useCallback(
      (connectionId: string) => {
        selectConnection(connectionId);
      },
      [selectConnection]
    );

    const handleFocusRoot = useCallback(() => {
      rootRef.current?.focus();
    }, []);

    const handleStartNodeDrag = useCallback(
      (nodeId: string, pointerX: number, pointerY: number) => {
        const nodesToDrag =
          selected.type === "nodes" && selected.nodeIds.has(nodeId)
            ? selected.nodeIds
            : new Set([nodeId]);

        const nodeOffsets = new Map<
          string,
          { offsetX: number; offsetY: number }
        >();
        for (const id of nodesToDrag) {
          const node = store.getNode(id);
          if (node) {
            nodeOffsets.set(id, {
              offsetX: pointerX - node.x,
              offsetY: pointerY - node.y,
            });
          }
        }

        dragLayerRef.current?.startNodeDrag(nodeOffsets);
      },
      [store, selected]
    );

    const handleStartConnectionDrag = useCallback(
      (from: ConnectionEndpoint, kind: PortKind, x: number, y: number) => {
        dragLayerRef.current?.startConnectionDrag(from, kind, x, y);
      },
      []
    );

    const handleEndDrag = useCallback(() => {
      dragLayerRef.current?.endDrag();
    }, []);

    const getNode = useCallback(
      (nodeId: string) => store.getNode(nodeId),
      [store]
    );

    if (!store.isInitialized()) {
      return <div className={styles.root}>Loading...</div>;
    }

    return (
      <div
        ref={rootRef}
        className={styles.root}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handleFocusRoot}
      >
        <div
          className={styles.world}
          style={{ width: worldSize.width, height: worldSize.height }}
        >
          <svg className={styles.canvas}>
            {renderCache.connectionPaths.map(({ connection, d }) => (
              <GraphConnectionPath
                key={connection.id}
                connection={connection}
                d={d}
                isSelected={
                  selected.type === "connection" &&
                  selected.connectionId === connection.id
                }
                onSelect={handleSelectConnection}
                onFocusRoot={handleFocusRoot}
              />
            ))}
          </svg>

          <div className={styles.nodesLayer}>
            <div className={styles.nodesLayerInner}>
              {structural.nodeIds.map((nodeId) => (
                <GraphNodeCardContainer
                  key={nodeId}
                  nodeId={nodeId}
                  isSelected={
                    selected.type === "nodes" && selected.nodeIds.has(nodeId)
                  }
                  zIndex={structural.nodeZOrder[nodeId] ?? 0}
                  audioState={audioState}
                  connectedPorts={renderCache.connectedPortsByNode.get(nodeId)}
                  rootRef={rootRef}
                  scrollRef={scrollRef}
                  onRegisterNodeEl={registerNodeEl}
                  onSelectNode={handleSelectNode}
                  onStartNodeDrag={handleStartNodeDrag}
                  onStartConnectionDrag={handleStartConnectionDrag}
                  onEndDrag={handleEndDrag}
                  onPatchNode={handlePatchNode}
                  onEmitMidi={emitMidi}
                  startBatch={startBatch}
                  endBatch={endBatch}
                />
              ))}
            </div>
          </div>

          <DragInteractionLayer
            ref={dragLayerRef}
            rootRef={rootRef}
            scrollRef={scrollRef}
            onMoveNodes={handleMoveNodes}
            onConnect={handleConnect}
            onDragStart={startBatch}
            onDragEnd={endBatch}
            getNode={getNode}
            nodeWidths={nodeWidths}
            structural={structural}
            selectNodes={selectNodes}
            deselect={deselect}
          />
        </div>

        <GraphHUD status={status} />
      </div>
    );
  }
);
