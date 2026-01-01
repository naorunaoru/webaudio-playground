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
  Selected,
} from "./types";
import { getNodeDef, portKindColor } from "./nodeRegistry";
import { NODE_HEADER_HEIGHT, PORT_ROW_HEIGHT, nodeHeight } from "./layout";
import { bezierPath } from "./coordinates";
import { canConnect, createNode, portMetaForNode } from "./graphUtils";
import { initialGraph } from "./initialGraph";
import { loadGraphFromStorage, saveGraphToStorage } from "./graphStorage";
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

export type GraphEditorProps = Readonly<{
  audioState: AudioContextState | "off";
  onGraphChange?: (graph: GraphState) => void;
  onEnsureAudioRunning?: (graph: GraphState) => Promise<void>;
}>;

export type GraphEditorHandle = Readonly<{
  addNode: (type: GraphNode["type"]) => void;
  getGraph: () => GraphState;
  setGraph: (graph: GraphState) => void;
  resetGraph: () => void;
}>;

export const GraphEditor = forwardRef<GraphEditorHandle, GraphEditorProps>(
  function GraphEditor(
    { audioState, onGraphChange, onEnsureAudioRunning },
    ref
  ) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const scrollRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    const [graph, setGraph] = useState<GraphState>(
      () => loadGraphFromStorage() ?? initialGraph()
    );
    const [selected, setSelected] = useState<Selected>({ type: "none" });
    const [status, setStatus] = useState<string | null>(null);

    const { nodeWidths, registerNodeEl } = useNodeWidths();
    const { levels, debug } = useAudioLevels(audioState);
    const { emitMidi } = useMidiDispatch({
      graph,
      setGraph,
      onEnsureAudioRunning,
    });

    const handleMoveNode = useCallback(
      (nodeId: string, x: number, y: number) => {
        setGraph((g) => ({
          ...g,
          nodes: g.nodes.map((n) =>
            n.id === nodeId ? ({ ...n, x, y } as GraphNode) : n
          ),
        }));
      },
      []
    );

    const handleConnect = useCallback(
      (from: ConnectionEndpoint, to: ConnectionEndpoint) => {
        setGraph((g) => {
          const res = canConnect(g, from, to);
          if (!res.ok) {
            setStatus(`Cannot connect (${res.reason})`);
            return g;
          }
          const conn: GraphConnection = {
            id: createId("c"),
            kind: res.kind,
            from,
            to,
          };
          setStatus(`Connected ${res.kind}`);
          return { ...g, connections: [...g.connections, conn] };
        });
      },
      []
    );

    const { drag, setDrag } = useDragInteraction({
      rootRef,
      scrollRef,
      onMoveNode: handleMoveNode,
      onConnect: handleConnect,
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

    // Notify parent of graph changes
    useEffect(() => {
      onGraphChange?.(graph);
    }, [graph, onGraphChange]);

    // Persist to localStorage
    useEffect(() => {
      saveGraphToStorage(graph);
    }, [graph]);

    // Imperative handle for parent
    useImperativeHandle(
      ref,
      () => ({
        addNode: (type) => {
          const root = rootRef.current;
          const rect = root?.getBoundingClientRect();
          const s = scrollRef.current;
          const baseX = rect ? s.x + rect.width * 0.5 : 240;
          const baseY = rect ? s.y + rect.height * 0.5 : 200;
          const jitterX = (Math.random() - 0.5) * 120;
          const jitterY = (Math.random() - 0.5) * 120;
          const node = createNode(
            type,
            Math.max(20, baseX + jitterX),
            Math.max(20, baseY + jitterY)
          );
          setGraph((g) => ({ ...g, nodes: [...g.nodes, node] }));
        },
        getGraph: () => graph,
        setGraph: (newGraph: GraphState) => {
          setGraph(newGraph);
        },
        resetGraph: () => {
          setGraph(initialGraph());
        },
      }),
      [graph]
    );

    // Auto-clear status
    useEffect(() => {
      if (!status) return;
      const t = window.setTimeout(() => setStatus(null), 2000);
      return () => window.clearTimeout(t);
    }, [status]);

    // Sync graph with audio engine
    useEffect(() => {
      if (audioState === "off") return;
      getAudioEngine().syncGraph(graph);
    }, [graph, audioState]);

    // Build render cache
    const renderCache = useMemo(() => {
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
    }, [graph.nodes, nodeWidths]);

    const patchNode = useCallback((nodeId: string, patch: Partial<any>) => {
      setGraph((g) => ({
        ...g,
        nodes: g.nodes.map((n) =>
          n.id === nodeId
            ? ({ ...n, state: { ...n.state, ...patch } } as GraphNode)
            : n
        ),
      }));
    }, []);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Backspace" || e.key === "Delete") {
          if (selected.type === "node") {
            const id = selected.nodeId;
            setGraph((g) => ({
              ...g,
              nodes: g.nodes.filter((n) => n.id !== id),
              connections: g.connections.filter(
                (c) => c.from.nodeId !== id && c.to.nodeId !== id
              ),
            }));
            setSelected({ type: "none" });
            return;
          }
          if (selected.type === "connection") {
            const id = selected.connectionId;
            setGraph((g) => ({
              ...g,
              connections: g.connections.filter((c) => c.id !== id),
            }));
            setSelected({ type: "none" });
          }
        }
        if (e.key === "Escape") {
          setDrag({ type: "none" });
          setSelected({ type: "none" });
        }
      },
      [selected, setDrag]
    );

    const handleSelectNode = useCallback((nodeId: string) => {
      setSelected({ type: "node", nodeId });
    }, []);

    const handleSelectConnection = useCallback((connectionId: string) => {
      setSelected({ type: "connection", connectionId });
    }, []);

    const handleFocusRoot = useCallback(() => {
      rootRef.current?.focus();
    }, []);

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
                    meterVisible={meterVisible}
                    meterColor={meterColor}
                    meterOpacity={meterOpacity}
                    midiVisible={midiVisible}
                    Ui={Ui}
                    debug={debug[node.id]}
                    rootRef={rootRef}
                    scrollRef={scrollRef}
                    onRegisterNodeEl={registerNodeEl}
                    onSelectNode={handleSelectNode}
                    onStartDrag={setDrag}
                    onPatchNode={patchNode}
                    onEmitMidi={emitMidi}
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
