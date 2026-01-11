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
import { getAudioEngine } from "@audio/engine";
import type {
  ConnectionEndpoint,
  GraphConnection,
  GraphNode,
  PortKind,
} from "./types";
import { getNodeDef } from "./nodeRegistry";
import { NODE_HEADER_HEIGHT, PORT_ROW_HEIGHT, nodeHeight } from "./layout";
import {
  bezierPath,
  localPointFromPointerEvent,
  viewToWorld,
} from "./coordinates";
import { canConnect, portColumnIndex, portMetaForNode } from "./graphUtils";
import { useDragInteraction, useNodeWidths } from "./hooks";
import {
  DragConnectionPreview,
  GraphConnectionPath,
  GraphHUD,
  GraphNodeCard,
} from "./components";
import { createId } from "./id";
import { useGraphDoc } from "@state";
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
      graphState: graph,
      moveNode,
      deleteNode,
      patchNode,
      addConnection,
      deleteConnection,
      setZOrder,
      startBatch,
      endBatch,
    } = useGraphDoc();

    const [status, setStatus] = useState<string | null>(null);

    const { selected, selectNodes, selectConnection, deselect } =
      useSelection();
    const { emitMidi } = useMidi();

    const { nodeWidths, registerNodeEl } = useNodeWidths();

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
      [graph, addConnection]
    );

    const { drag, setDrag } = useDragInteraction({
      rootRef,
      scrollRef,
      onMoveNodes: handleMoveNodes,
      onConnect: handleConnect,
      onDragStart: startBatch,
      onDragEnd: endBatch,
    });

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

    // Sync graph with audio engine
    useEffect(() => {
      if (audioState === "off" || !graph) return;
      getAudioEngine().syncGraph(graph);
    }, [graph, audioState]);

    // Build render cache
    const renderCache = useMemo(() => {
      if (!graph)
        return {
          nodes: [],
          connections: [],
          connectedPortsByNode: new Map<string, Set<string>>(),
        };

      // Compute connected ports per node
      const connectedPortsByNode = new Map<string, Set<string>>();
      for (const conn of graph.connections) {
        // Add the output port for the source node
        if (!connectedPortsByNode.has(conn.from.nodeId)) {
          connectedPortsByNode.set(conn.from.nodeId, new Set());
        }
        connectedPortsByNode.get(conn.from.nodeId)!.add(conn.from.portId);

        // Add the input port for the destination node
        if (!connectedPortsByNode.has(conn.to.nodeId)) {
          connectedPortsByNode.set(conn.to.nodeId, new Set());
        }
        connectedPortsByNode.get(conn.to.nodeId)!.add(conn.to.portId);
      }

      const nodes = graph.nodes.map((node) => {
        const def = getNodeDef(node.type);
        const ports = portMetaForNode(node);
        const portIndex = new Map<string, number>();
        for (let i = 0; i < ports.length; i++) portIndex.set(ports[i]!.id, i);
        const height = nodeHeight(ports.length);
        const Ui = (def as any).ui as any;
        return { node, def, ports, portIndex, height, Ui };
      });

      const nodeById = new Map<string, (typeof nodes)[number]>();
      for (const n of nodes) nodeById.set(n.node.id, n);

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

      const connections = graph.connections
        .map((c) => {
          const fromNode = nodeById.get(c.from.nodeId);
          const toNode = nodeById.get(c.to.nodeId);
          if (!fromNode || !toNode) return null;

          const fromPort = fromNode.ports.find((p) => p.id === c.from.portId);
          const toPort = toNode.ports.find((p) => p.id === c.to.portId);
          if (!fromPort || !toPort) return null;

          const fromColIdx = portColumnIndex(fromNode.ports, c.from.portId);
          const toColIdx = portColumnIndex(toNode.ports, c.to.portId);

          const fp1 = portCenter(fromNode.node, fromPort as any, fromColIdx);
          const fp2 = portCenter(toNode.node, toPort as any, toColIdx);
          return {
            connection: c,
            d: bezierPath(fp1.x, fp1.y, fp2.x, fp2.y),
          };
        })
        .filter((v): v is NonNullable<typeof v> => v != null);

      return { nodes, connections, connectedPortsByNode };
    }, [graph, nodeWidths]);

    const worldSize = useMemo(() => {
      if (!graph) return { width: 2400, height: 1600 };

      let maxX = 0;
      let maxY = 0;
      for (const n of graph.nodes) {
        maxX = Math.max(maxX, n.x + (nodeWidths[n.id] ?? 240));
        maxY = Math.max(maxY, n.y);
      }
      return {
        width: Math.max(2400, Math.ceil(maxX + 1200)),
        height: Math.max(1600, Math.ceil(maxY + 1200)),
      };
    }, [graph, nodeWidths]);

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
          setDrag({ type: "none" });
          deselect();
        }
      },
      [selected, setDrag, deleteNode, deleteConnection, deselect]
    );

    const handleSelectNode = useCallback(
      (nodeId: string) => {
        // Don't change selection if the node is already part of the current selection
        const isAlreadySelected =
          selected.type === "nodes" && selected.nodeIds.has(nodeId);

        if (!isAlreadySelected) {
          selectNodes(nodeId);
        }

        if (!graph) return;

        const currentZ = graph.nodeZOrder ?? {};
        const zValues = Object.values(currentZ);
        const maxZ = zValues.length > 0 ? Math.max(...zValues) : 0;
        const nodeZ = currentZ[nodeId];

        // Skip if node is already on top
        if (nodeZ !== undefined && nodeZ === maxZ) {
          return;
        }

        // Calculate new z-index
        let newZ = maxZ + 1;

        // Normalize if z-indices are getting too large
        if (maxZ > graph.nodes.length * 2) {
          const sorted = Object.entries(currentZ)
            .filter(([id]) => id !== nodeId)
            .sort((a, b) => a[1] - b[1]);
          newZ = sorted.length + 1;
        }

        setZOrder(nodeId, newZ);
      },
      [graph, selected, setZOrder, selectNodes]
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
        if (!graph) return;

        // If clicked node is part of selection, drag all selected nodes
        // Otherwise just drag the clicked node
        const nodesToDrag =
          selected.type === "nodes" && selected.nodeIds.has(nodeId)
            ? selected.nodeIds
            : new Set([nodeId]);

        // Build offsets for all nodes
        const nodeOffsets = new Map<
          string,
          { offsetX: number; offsetY: number }
        >();
        for (const id of nodesToDrag) {
          const node = graph.nodes.find((n) => n.id === id);
          if (node) {
            nodeOffsets.set(id, {
              offsetX: pointerX - node.x,
              offsetY: pointerY - node.y,
            });
          }
        }

        setDrag({ type: "moveNodes", nodeOffsets });
      },
      [graph, selected, setDrag]
    );

    const handleStartConnectionDrag = useCallback(
      (from: ConnectionEndpoint, kind: PortKind, x: number, y: number) => {
        setDrag({ type: "connect", from, kind, toX: x, toY: y });
      },
      [setDrag]
    );

    const handleEndDrag = useCallback(() => {
      setDrag({ type: "none" });
    }, [setDrag]);

    // Marquee selection handlers
    const handleWorldPointerDown = useCallback(
      (e: React.PointerEvent) => {
        // Only start marquee on left mouse button, directly on the world/canvas
        if (e.button !== 0) return;
        if (drag.type !== "none") return;

        const root = rootRef.current;
        if (!root) return;

        // Get world coordinates
        const local = localPointFromPointerEvent(root, e);
        const world = viewToWorld(
          local,
          scrollRef.current.x,
          scrollRef.current.y
        );

        setDrag({
          type: "marquee",
          startX: world.x,
          startY: world.y,
          currentX: world.x,
          currentY: world.y,
        });

        deselect();
      },
      [drag.type, setDrag, deselect]
    );

    const handleWorldPointerMove = useCallback(
      (e: React.PointerEvent) => {
        if (drag.type !== "marquee") return;

        const root = rootRef.current;
        if (!root) return;

        const local = localPointFromPointerEvent(root, e);
        const world = viewToWorld(
          local,
          scrollRef.current.x,
          scrollRef.current.y
        );

        setDrag({
          ...drag,
          currentX: world.x,
          currentY: world.y,
        });
      },
      [drag, setDrag]
    );

    const handleWorldPointerUp = useCallback(
      (e: React.PointerEvent) => {
        if (drag.type !== "marquee") return;
        if (!graph) return;

        const root = rootRef.current;
        if (!root) return;

        const local = localPointFromPointerEvent(root, e);
        const world = viewToWorld(
          local,
          scrollRef.current.x,
          scrollRef.current.y
        );

        // Calculate marquee bounds
        const minX = Math.min(drag.startX, world.x);
        const maxX = Math.max(drag.startX, world.x);
        const minY = Math.min(drag.startY, world.y);
        const maxY = Math.max(drag.startY, world.y);

        // Find nodes within the marquee
        const selectedNodeIds = new Set<string>();
        for (const node of graph.nodes) {
          const nodeWidth = nodeWidths[node.id] ?? 240;
          const nodeH =
            renderCache.nodes.find((n) => n.node.id === node.id)?.height ?? 200;

          // Check if node intersects with marquee
          const nodeRight = node.x + nodeWidth;
          const nodeBottom = node.y + nodeH;

          if (
            node.x < maxX &&
            nodeRight > minX &&
            node.y < maxY &&
            nodeBottom > minY
          ) {
            selectedNodeIds.add(node.id);
          }
        }

        selectNodes(selectedNodeIds);
        setDrag({ type: "none" });
      },
      [drag, graph, nodeWidths, renderCache.nodes, selectNodes, setDrag]
    );

    // Compute marquee rectangle for rendering
    const marqueeRect = useMemo(() => {
      if (drag.type !== "marquee") return null;
      const x = Math.min(drag.startX, drag.currentX);
      const y = Math.min(drag.startY, drag.currentY);
      const width = Math.abs(drag.currentX - drag.startX);
      const height = Math.abs(drag.currentY - drag.startY);
      return { x, y, width, height };
    }, [drag]);

    if (!graph) {
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
          onPointerDown={handleWorldPointerDown}
          onPointerMove={handleWorldPointerMove}
          onPointerUp={handleWorldPointerUp}
        >
          <svg className={styles.canvas}>
            {renderCache.connections.map(({ connection, d }) => (
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

            <DragConnectionPreview
              drag={drag}
              graph={graph}
              nodeWidths={nodeWidths}
            />
          </svg>

          <div className={styles.nodesLayer}>
            <div className={styles.nodesLayerInner}>
              {renderCache.nodes.map(({ node, def: { title }, ports, Ui }) => {
                const midiVisible =
                  node.type === "midiSource" && !!node.state.isEmitting;

                return (
                  <GraphNodeCard
                    key={node.id}
                    node={node}
                    title={title}
                    ports={ports}
                    isSelected={
                      selected.type === "nodes" && selected.nodeIds.has(node.id)
                    }
                    zIndex={graph.nodeZOrder?.[node.id] ?? 0}
                    audioState={audioState}
                    midiVisible={midiVisible}
                    connectedPorts={renderCache.connectedPortsByNode.get(
                      node.id
                    )}
                    Ui={Ui}
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
                );
              })}
            </div>
          </div>

          {marqueeRect && (
            <div
              className={styles.marquee}
              style={{
                left: marqueeRect.x,
                top: marqueeRect.y,
                width: marqueeRect.width,
                height: marqueeRect.height,
              }}
            />
          )}
        </div>

        <GraphHUD status={status} />
      </div>
    );
  }
);
