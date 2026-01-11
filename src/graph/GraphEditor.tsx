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
import { getAudioEngine } from "../audio/engine";
import type {
  ConnectionEndpoint,
  GraphConnection,
  GraphNode,
} from "./types";
import { getNodeDef } from "./nodeRegistry";
import { NODE_HEADER_HEIGHT, PORT_ROW_HEIGHT, nodeHeight } from "./layout";
import { bezierPath } from "./coordinates";
import { canConnect, portMetaForNode } from "./graphUtils";
import {
  useAudioLevels,
  useDragInteraction,
  useNodeWidths,
} from "./hooks";
import {
  DragConnectionPreview,
  GraphConnectionPath,
  GraphHUD,
  GraphNodeCard,
} from "./components";
import { createId } from "./id";
import { useGraphDoc } from "../state";
import { useSelection, useMidi } from "../contexts";

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

    const { selected, selectNode, selectConnection, deselect } = useSelection();
    const { emitMidi } = useMidi();

    const { nodeWidths, registerNodeEl } = useNodeWidths();
    const { runtimeState } = useAudioLevels(audioState);

    const handleMoveNode = useCallback(
      (nodeId: string, x: number, y: number) => {
        moveNode(nodeId, x, y);
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
      onMoveNode: handleMoveNode,
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
      if (!graph) return { nodes: [], connections: [] };

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

          const fromIndex = fromNode.portIndex.get(c.from.portId);
          const toIndex = toNode.portIndex.get(c.to.portId);
          if (fromIndex == null || toIndex == null) return null;

          const fromPort = fromNode.ports[fromIndex];
          const toPort = toNode.ports[toIndex];
          if (!fromPort || !toPort) return null;

          const fp1 = portCenter(fromNode.node, fromPort as any, fromIndex);
          const fp2 = portCenter(toNode.node, toPort as any, toIndex);
          return {
            connection: c,
            d: bezierPath(fp1.x, fp1.y, fp2.x, fp2.y),
          };
        })
        .filter((v): v is NonNullable<typeof v> => v != null);

      return { nodes, connections };
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
          if (selected.type === "node") {
            deleteNode(selected.nodeId);
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
        selectNode(nodeId);

        if (!graph) return;

        const currentZ = graph.nodeZOrder ?? {};
        const zValues = Object.values(currentZ);
        const maxZ = zValues.length > 0 ? Math.max(...zValues) : 0;
        const nodeZ = currentZ[nodeId];
        // Skip if node is already on top, or if this is the only node without ordering yet
        if (nodeZ === maxZ || (nodeZ === undefined && zValues.length === 0)) return;

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
      [graph, setZOrder, selectNode]
    );

    const handleSelectConnection = useCallback((connectionId: string) => {
      selectConnection(connectionId);
    }, [selectConnection]);

    const handleFocusRoot = useCallback(() => {
      rootRef.current?.focus();
    }, []);

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
                      selected.type === "node" && selected.nodeId === node.id
                    }
                    zIndex={graph.nodeZOrder?.[node.id] ?? 0}
                    audioState={audioState}
                    midiVisible={midiVisible}
                    Ui={Ui}
                    runtimeState={runtimeState[node.id]}
                    rootRef={rootRef}
                    scrollRef={scrollRef}
                    onRegisterNodeEl={registerNodeEl}
                    onSelectNode={handleSelectNode}
                    onStartDrag={setDrag}
                    onPatchNode={handlePatchNode}
                    onEmitMidi={emitMidi}
                    startBatch={startBatch}
                    endBatch={endBatch}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <GraphHUD status={status} />
      </div>
    );
  }
);
