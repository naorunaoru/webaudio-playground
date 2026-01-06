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
  GraphState,
  NodeId,
  Selected,
} from "./types";
import { getNodeDef, portKindColor } from "./nodeRegistry";
import { NODE_HEADER_HEIGHT, PORT_ROW_HEIGHT, nodeHeight } from "./layout";
import { bezierPath } from "./coordinates";
import { canConnect, portMetaForNode } from "./graphUtils";
import {
  useAudioLevels,
  useDragInteraction,
  useMidiDispatch,
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

export type GraphEditorProps = Readonly<{
  audioState: AudioContextState | "off";
  onEnsureAudioRunning?: (graph: GraphState) => Promise<void>;
}>;

export type GraphEditorHandle = Readonly<{
  focus: () => void;
}>;

export const GraphEditor = forwardRef<GraphEditorHandle, GraphEditorProps>(
  function GraphEditor({ audioState, onEnsureAudioRunning }, ref) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const scrollRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    const {
      graphState: graph,
      moveNode,
      deleteNode,
      patchNode,
      patchMultipleNodesEphemeral,
      addConnection,
      deleteConnection,
      setZOrder,
      startBatch,
      endBatch,
    } = useGraphDoc();

    const [selected, setSelected] = useState<Selected>({ type: "none" });
    const [status, setStatus] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<{
      nodeId: NodeId;
      x: number;
      y: number;
    } | null>(null);

    const { nodeWidths, registerNodeEl } = useNodeWidths();
    const { levels, runtimeState } = useAudioLevels(audioState);
    const { emitMidi } = useMidiDispatch({
      graph: graph!,
      onEnsureAudioRunning,
      onPatchNodesEphemeral: patchMultipleNodesEphemeral,
    });

    const handleMoveNode = useCallback(
      (nodeId: string, x: number, y: number) => {
        moveNode(nodeId, x, y);
      },
      [moveNode]
    );

    const handleConnect = useCallback(
      (from: ConnectionEndpoint, to: ConnectionEndpoint) => {
        if (!graph) return;

        const resolveShellEndpoint = (
          ep: ConnectionEndpoint
        ): ConnectionEndpoint => {
          const n = graph.nodes.find((nn) => nn.id === ep.nodeId);
          if (!n) return ep;
          const s = n.state as any;
          const pitchId =
            typeof s?.pitchId === "string" ? (s.pitchId as NodeId) : null;
          const sinId =
            typeof s?.sinId === "string" ? (s.sinId as NodeId) : null;
          if (ep.portId === "midi_in" && pitchId)
            return { nodeId: pitchId, portId: "midi_in" };
          if (ep.portId === "phase_in" && sinId)
            return { nodeId: sinId, portId: "phase_in" };
          if (ep.portId === "audio_out" && sinId)
            return { nodeId: sinId, portId: "audio_out" };
          return ep;
        };

        const resolvedFrom = resolveShellEndpoint(from);
        const resolvedTo = resolveShellEndpoint(to);

        const res = canConnect(graph, resolvedFrom, resolvedTo);
        if (!res.ok) {
          setStatus(`Cannot connect (${res.reason})`);
          return;
        }

        const conn: GraphConnection = {
          id: createId("c"),
          kind: res.kind,
          from: resolvedFrom,
          to: resolvedTo,
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

      const readPmShellState = (node: GraphNode) => {
        const s = node.state as any;
        return {
          pitchId:
            typeof s?.pitchId === "string" ? (s.pitchId as NodeId) : null,
          phasorId:
            typeof s?.phasorId === "string" ? (s.phasorId as NodeId) : null,
          sinId: typeof s?.sinId === "string" ? (s.sinId as NodeId) : null,
          collapsed: s?.collapsed === true,
        };
      };

      const hidden = new Set<NodeId>();
      const shellByChild = new Map<
        NodeId,
        { shellId: NodeId; role: "pitch" | "phasor" | "sin" }
      >();

      for (const n of graph.nodes) {
        const s = readPmShellState(n);
        if (!s) continue;
        const shellId = n.id as NodeId;
        if (s.pitchId) shellByChild.set(s.pitchId, { shellId, role: "pitch" });
        if (s.phasorId)
          shellByChild.set(s.phasorId, { shellId, role: "phasor" });
        if (s.sinId) shellByChild.set(s.sinId, { shellId, role: "sin" });
        if (s.collapsed) {
          if (s.pitchId) hidden.add(s.pitchId);
          if (s.phasorId) hidden.add(s.phasorId);
          if (s.sinId) hidden.add(s.sinId);
        }
      }

      const nodes = graph.nodes
        .filter((node) => !hidden.has(node.id as NodeId))
        .map((node) => {
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

      const mapEndpointForDisplay = (
        endpoint: ConnectionEndpoint,
        kind: GraphConnection["kind"],
        direction: "from" | "to"
      ): ConnectionEndpoint | null => {
        const nodeId = endpoint.nodeId as NodeId;
        if (!hidden.has(nodeId)) return endpoint;

        const owner = shellByChild.get(nodeId);
        if (!owner) return null;

        if (direction === "to") {
          if (
            kind === "midi" &&
            owner.role === "pitch" &&
            endpoint.portId === "midi_in"
          ) {
            return { nodeId: owner.shellId, portId: "midi_in" };
          }
          if (
            kind === "audio" &&
            owner.role === "sin" &&
            endpoint.portId === "phase_in"
          ) {
            return { nodeId: owner.shellId, portId: "phase_in" };
          }
          return null;
        }

        if (direction === "from") {
          if (
            kind === "audio" &&
            owner.role === "sin" &&
            endpoint.portId === "audio_out"
          ) {
            return { nodeId: owner.shellId, portId: "audio_out" };
          }
          return null;
        }

        return null;
      };

      const connections = graph.connections
        .map((c) => {
          const from = mapEndpointForDisplay(c.from, c.kind, "from");
          const to = mapEndpointForDisplay(c.to, c.kind, "to");
          if (!from || !to) return null;

          const fromNode = nodeById.get(from.nodeId);
          const toNode = nodeById.get(to.nodeId);
          if (!fromNode || !toNode) return null;

          const fromIndex = fromNode.portIndex.get(from.portId);
          const toIndex = toNode.portIndex.get(to.portId);
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
            setSelected({ type: "none" });
            return;
          }
          if (selected.type === "connection") {
            deleteConnection(selected.connectionId);
            setSelected({ type: "none" });
          }
        }
        if (e.key === "Escape") {
          setDrag({ type: "none" });
          setSelected({ type: "none" });
          setContextMenu(null);
        }
      },
      [selected, setDrag, deleteNode, deleteConnection]
    );

    const handleSelectNode = useCallback(
      (nodeId: string) => {
        setSelected({ type: "node", nodeId });

        if (!graph) return;

        const currentZ = graph.nodeZOrder ?? {};
        const zValues = Object.values(currentZ);
        const maxZ = zValues.length > 0 ? Math.max(...zValues) : 0;
        const nodeZ = currentZ[nodeId];
        // Skip if node is already on top, or if this is the only node without ordering yet
        if (nodeZ === maxZ || (nodeZ === undefined && zValues.length === 0))
          return;

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
      [graph, setZOrder]
    );

    const handleSelectConnection = useCallback((connectionId: string) => {
      setSelected({ type: "connection", connectionId });
    }, []);

    const handleFocusRoot = useCallback((_e?: unknown) => {
      setContextMenu(null);
      rootRef.current?.focus();
    }, []);

    if (!graph) {
      return <div className={styles.root}>Loading...</div>;
    }

    const contextNode =
      contextMenu && graph
        ? graph.nodes.find((n) => n.id === contextMenu.nodeId) ?? null
        : null;

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
                const audioLevel = levels[node.id] ?? 0;
                const normalized = Math.max(0, Math.min(1, audioLevel / 0.12));
                const meterOpacity =
                  node.type === "audioOut"
                    ? 0.15 + normalized * 0.8
                    : normalized * 0.95;

                const meterVisible =
                  node.type === "audioOut" || levels[node.id] != null;
                const meterColor =
                  node.type === "audioOut"
                    ? "rgba(236, 239, 244, 1)"
                    : portKindColor("audio");

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
                    meterVisible={meterVisible}
                    meterColor={meterColor}
                    meterOpacity={meterOpacity}
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
                    onOpenContextMenu={(nodeId, x, y) => {
                      setContextMenu({ nodeId, x, y });
                    }}
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
