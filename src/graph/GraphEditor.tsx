import type React from "react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./GraphEditor.module.css";
import { createId } from "./id";
import { getAudioEngine } from "../audio/engine";
import type {
  ConnectionEndpoint,
  GraphConnection,
  GraphNode,
  GraphState,
  MidiEvent,
  NodeId,
  PortId,
  PortKind,
} from "./types";
import { getNodeDef, portKindColor } from "./nodeRegistry";
import {
  NODE_HEADER_HEIGHT,
  NODE_PADDING,
  PORT_ROW_HEIGHT,
  nodeHeight,
} from "./layout";

const GRAPH_STORAGE_KEY = "webaudio-playground:graph:v1";

type DragState =
  | { type: "none" }
  | {
      type: "moveNode";
      nodeId: NodeId;
      offsetX: number;
      offsetY: number;
    }
  | {
      type: "connect";
      from: ConnectionEndpoint;
      kind: PortKind;
      toX: number;
      toY: number;
    };

type Selected =
  | { type: "none" }
  | { type: "node"; nodeId: NodeId }
  | { type: "connection"; connectionId: string };

function loadGraphFromStorage(): GraphState | null {
  try {
    const raw = localStorage.getItem(GRAPH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const g = parsed as Partial<GraphState>;
    if (!Array.isArray(g.nodes) || !Array.isArray(g.connections)) return null;
    return normalizeGraph(g as GraphState);
  } catch {
    return null;
  }
}

function normalizeGraph(graph: GraphState): GraphState {
  const nodes = graph.nodes.map((n) => {
    const def = getNodeDef(n.type as any) as any;
    if (!def.normalizeState) return n;
    return { ...n, state: def.normalizeState((n as any).state) };
  });

  const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
  const connections = (graph.connections ?? []).filter((c) => {
    const fromNode = nodeById.get(c.from.nodeId);
    const toNode = nodeById.get(c.to.nodeId);
    if (!fromNode || !toNode) return false;
    const fromPort = getNodeDef(fromNode.type)
      .ports(fromNode as any)
      .find((p) => p.id === c.from.portId);
    const toPort = getNodeDef(toNode.type)
      .ports(toNode as any)
      .find((p) => p.id === c.to.portId);
    if (!fromPort || !toPort) return false;
    if (fromPort.direction !== "out" || toPort.direction !== "in") return false;
    if (fromPort.kind !== toPort.kind) return false;
    if (c.kind !== fromPort.kind) return false;
    return true;
  });

  return { ...graph, nodes, connections };
}

function initialGraph(): GraphState {
  return {
    nodes: [
      {
        id: "n_midi",
        type: "midiSource",
        x: 40,
        y: 120,
        state: getNodeDef("midiSource").defaultState(),
      } as any,
      {
        id: "n_cc",
        type: "ccSource",
        x: 40,
        y: 300,
        state: getNodeDef("ccSource").defaultState(),
      } as any,
      {
        id: "n_osc",
        type: "oscillator",
        x: 340,
        y: 90,
        state: getNodeDef("oscillator").defaultState(),
      } as any,
      {
        id: "n_env",
        type: "envelope",
        x: 340,
        y: 290,
        state: getNodeDef("envelope").defaultState(),
      } as any,
      {
        id: "n_gain",
        type: "gain",
        x: 520,
        y: 150,
        state: getNodeDef("gain").defaultState(),
      } as any,
      {
        id: "n_out",
        type: "audioOut",
        x: 720,
        y: 150,
        state: getNodeDef("audioOut").defaultState(),
      } as any,
    ],
    connections: [
      {
        id: "c_midi_osc",
        kind: "midi",
        from: { nodeId: "n_midi", portId: "midi_out" },
        to: { nodeId: "n_osc", portId: "midi_in" },
      },
      {
        id: "c_midi_env",
        kind: "midi",
        from: { nodeId: "n_midi", portId: "midi_out" },
        to: { nodeId: "n_env", portId: "midi_in" },
      },
      {
        id: "c_osc_gain",
        kind: "audio",
        from: { nodeId: "n_osc", portId: "audio_out" },
        to: { nodeId: "n_gain", portId: "audio_in" },
      },
      {
        id: "c_env_gain",
        kind: "automation",
        from: { nodeId: "n_env", portId: "env_out" },
        to: { nodeId: "n_gain", portId: "gain_in" },
      },
      {
        id: "c_gain_out",
        kind: "audio",
        from: { nodeId: "n_gain", portId: "audio_out" },
        to: { nodeId: "n_out", portId: "audio_in" },
      },
    ],
  };
}

function createNode(type: GraphNode["type"], x: number, y: number): GraphNode {
  const def = getNodeDef(type as any) as any;
  return { id: createId("n"), type, x, y, state: def.defaultState() };
}

function portMetaForNode(node: GraphNode) {
  const def = getNodeDef(node.type);
  const ports = def.ports(node as any);
  return ports;
}

function findNode(graph: GraphState, nodeId: NodeId): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === nodeId);
}

function portById(node: GraphNode, portId: PortId) {
  return portMetaForNode(node).find((p) => p.id === portId);
}

function connectionKey(
  kind: PortKind,
  from: ConnectionEndpoint,
  to: ConnectionEndpoint
) {
  return `${kind}:${from.nodeId}.${from.portId}->${to.nodeId}.${to.portId}`;
}

function canConnect(
  graph: GraphState,
  from: ConnectionEndpoint,
  to: ConnectionEndpoint
): { ok: true; kind: PortKind } | { ok: false; reason: string } {
  if (from.nodeId === to.nodeId) return { ok: false, reason: "same node" };
  const fromNode = findNode(graph, from.nodeId);
  const toNode = findNode(graph, to.nodeId);
  if (!fromNode || !toNode) return { ok: false, reason: "missing node" };

  const fromPort = portById(fromNode, from.portId);
  const toPort = portById(toNode, to.portId);
  if (!fromPort || !toPort) return { ok: false, reason: "missing port" };
  if (fromPort.direction !== "out" || toPort.direction !== "in") {
    return { ok: false, reason: "direction mismatch" };
  }
  if (fromPort.kind !== toPort.kind)
    return { ok: false, reason: "kind mismatch" };

  const key = connectionKey(fromPort.kind, from, to);
  const exists = graph.connections.some(
    (c) => connectionKey(c.kind, c.from, c.to) === key
  );
  if (exists) return { ok: false, reason: "already connected" };
  return { ok: true, kind: fromPort.kind };
}

type MidiDelivery = { nodeId: NodeId; portId: PortId | null };

function routeMidi(
  graph: GraphState,
  sourceNodeId: NodeId,
  event: MidiEvent
): GraphState {
  const seen = new Set<string>();
  const queue: MidiDelivery[] = [];
  const nodePatches = new Map<NodeId, Partial<any>>();

  const edgeKind: PortKind = event.type === "cc" ? "cc" : "midi";

  const starts = graph.connections.filter(
    (c) => c.kind === edgeKind && c.from.nodeId === sourceNodeId
  );
  for (const conn of starts)
    queue.push({ nodeId: conn.to.nodeId, portId: conn.to.portId });

  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = `${current.nodeId}:${current.portId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const node = findNode(graph, current.nodeId);
    if (!node) continue;

    const def = getNodeDef(node.type);
    if (def.onMidi) {
      const patch = def.onMidi(node as any, event, current.portId);
      if (patch)
        nodePatches.set(node.id, {
          ...(nodePatches.get(node.id) ?? {}),
          ...patch,
        });
    }

    if (node.type === "oscillator" && event.type === "noteOn") {
      const visited = new Set<NodeId>();
      const queue: NodeId[] = [node.id];
      while (queue.length > 0) {
        const currentNodeId = queue.shift()!;
        if (visited.has(currentNodeId)) continue;
        visited.add(currentNodeId);

        const outgoing = graph.connections.filter(
          (c) => c.kind === "audio" && c.from.nodeId === currentNodeId
        );
        for (const conn of outgoing) {
          const toNode = findNode(graph, conn.to.nodeId);
          if (toNode?.type === "audioOut") {
            nodePatches.set(conn.to.nodeId, {
              ...(nodePatches.get(conn.to.nodeId) ?? {}),
              lastAudioAtMs: event.atMs,
            });
          } else {
            queue.push(conn.to.nodeId);
          }
        }
      }
    }

    const outgoing = graph.connections.filter(
      (c) => c.kind === edgeKind && c.from.nodeId === node.id
    );
    for (const conn of outgoing)
      queue.push({ nodeId: conn.to.nodeId, portId: conn.to.portId });
  }

  if (nodePatches.size === 0) return graph;
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const patch = nodePatches.get(n.id);
      if (!patch) return n;
      return { ...n, state: { ...n.state, ...patch } } as GraphNode;
    }),
  };
}

function localPointFromPointerEvent(
  root: HTMLElement,
  e: React.PointerEvent
): { x: number; y: number } {
  const rect = root.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function localPointFromClientPoint(
  root: HTMLElement,
  clientX: number,
  clientY: number
): { x: number; y: number } {
  const rect = root.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function viewToWorld(
  p: { x: number; y: number },
  scrollX: number,
  scrollY: number
) {
  return { x: p.x + scrollX, y: p.y + scrollY };
}

function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(60, Math.abs(x2 - x1) * 0.5);
  const c1x = x1 + dx;
  const c2x = x2 - dx;
  return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
}

function shallowEqualNumberRecord(
  a: Record<string, number>,
  b: Record<string, number>,
  eps = 1e-4
): boolean {
  if (a === b) return true;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    const av = a[k];
    const bv = b[k];
    if (bv == null) return false;
    if (Math.abs((av ?? 0) - (bv ?? 0)) > eps) return false;
  }
  return true;
}

function shallowEqualRecordByValueRef(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean {
  if (a === b) return true;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export type GraphEditorProps = Readonly<{
  audioState: AudioContextState | "off";
  onGraphChange?: (graph: GraphState) => void;
  onEnsureAudioRunning?: (graph: GraphState) => Promise<void>;
}>;

export type GraphEditorHandle = Readonly<{
  addNode: (type: GraphNode["type"]) => void;
  getGraph: () => GraphState;
}>;

export const GraphEditor = forwardRef<GraphEditorHandle, GraphEditorProps>(
  function GraphEditor(
    { audioState, onGraphChange, onEnsureAudioRunning },
    ref
  ) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const worldRef = useRef<HTMLDivElement | null>(null);
    const [graph, setGraph] = useState<GraphState>(
      () => loadGraphFromStorage() ?? initialGraph()
    );
    const [drag, setDrag] = useState<DragState>({ type: "none" });
    const [selected, setSelected] = useState<Selected>({ type: "none" });
    const [status, setStatus] = useState<string | null>(null);
    const [levels, setLevels] = useState<Record<string, number>>({});
    const [debug, setDebug] = useState<Record<string, unknown>>({});
    const dragRef = useRef<DragState>({ type: "none" });
    const scrollRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const nodeElsRef = useRef(new Map<NodeId, HTMLElement>());
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const [nodeWidths, setNodeWidths] = useState<Record<string, number>>({});
    const pendingMidiDispatchQueueRef = useRef<
      Array<{
        graph: GraphState;
        nodeId: NodeId;
        event: MidiEvent;
        resolve: () => void;
        reject: (err: unknown) => void;
      }>
    >([]);
    const drainingMidiDispatchQueueRef = useRef(false);

    useEffect(() => {
      dragRef.current = drag;
    }, [drag]);

    useEffect(() => {
      const queue = pendingMidiDispatchQueueRef.current;
      if (queue.length === 0) return;
      if (drainingMidiDispatchQueueRef.current) return;
      drainingMidiDispatchQueueRef.current = true;

      void (async () => {
        try {
          while (queue.length > 0) {
            const item = queue.shift()!;
            try {
              await onEnsureAudioRunning?.(item.graph);
              getAudioEngine().dispatchMidi(
                item.graph,
                item.nodeId,
                item.event
              );
              item.resolve();
            } catch (err) {
              item.reject(err);
            }
          }
        } finally {
          drainingMidiDispatchQueueRef.current = false;
        }
      })();
    }, [graph, onEnsureAudioRunning]);

    useEffect(() => {
      const ro = new ResizeObserver((entries) => {
        setNodeWidths((prev) => {
          let next: Record<string, number> | null = null;
          for (const entry of entries) {
            const el = entry.target as HTMLElement;
            const nodeId = el.getAttribute("data-node-id");
            if (!nodeId) continue;
            const w = Math.max(0, Math.round(entry.contentRect.width));
            if (prev[nodeId] === w) continue;
            next ??= { ...prev };
            next[nodeId] = w;
          }
          return next ?? prev;
        });
      });
      resizeObserverRef.current = ro;
      for (const el of nodeElsRef.current.values()) ro.observe(el);
      return () => {
        ro.disconnect();
        resizeObserverRef.current = null;
      };
    }, []);

    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;

      const onScroll = () => {
        scrollRef.current = { x: root.scrollLeft, y: root.scrollTop };
      };

      // Initialize once mounted.
      onScroll();
      root.addEventListener("scroll", onScroll, { passive: true });
      return () => {
        root.removeEventListener("scroll", onScroll);
      };
    }, []);

    useEffect(() => {
      onGraphChange?.(graph);
    }, [graph, onGraphChange]);

    useEffect(() => {
      try {
        localStorage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(graph));
      } catch {
        // ignore
      }
    }, [graph]);

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
      }),
      [graph]
    );

    useEffect(() => {
      if (!status) return;
      const t = window.setTimeout(() => setStatus(null), 2000);
      return () => window.clearTimeout(t);
    }, [status]);

    useEffect(() => {
      if (audioState === "off") return;
      getAudioEngine().syncGraph(graph);
    }, [graph, audioState]);

    useEffect(() => {
      if (audioState === "running") {
        const interval = window.setInterval(() => {
          const engine = getAudioEngine();
          const nextLevels = engine.getLevels();
          const nextDebug = engine.getDebug();
          setLevels((prev) =>
            shallowEqualNumberRecord(prev, nextLevels) ? prev : nextLevels
          );
          setDebug((prev) =>
            shallowEqualRecordByValueRef(prev, nextDebug) ? prev : nextDebug
          );
        }, 100);
        return () => window.clearInterval(interval);
      } else {
        setLevels({});
        setDebug({});
      }
    }, [audioState]);

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
        portIndex: number
      ) => {
        const width = nodeWidths[node.id] ?? 240;
        let x = port.direction === "in" ? node.x : node.x + width;
        x += 1;
        let y =
          node.y +
          NODE_HEADER_HEIGHT +
          portIndex * PORT_ROW_HEIGHT +
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

    function patchNode(nodeId: NodeId, patch: Partial<any>) {
      setGraph((g) => ({
        ...g,
        nodes: g.nodes.map((n) =>
          n.id === nodeId
            ? ({ ...n, state: { ...n.state, ...patch } } as GraphNode)
            : n
        ),
      }));
    }

    useEffect(() => {
      if (drag.type === "none") return;

      const onPointerMove = (e: PointerEvent) => {
        const root = rootRef.current;
        if (!root) return;

        const currentDrag = dragRef.current;
        const currentScroll = scrollRef.current;

        const p = localPointFromClientPoint(root, e.clientX, e.clientY);
        const gp = viewToWorld(p, currentScroll.x, currentScroll.y);

        if (currentDrag.type === "moveNode") {
          setGraph((g) => ({
            ...g,
            nodes: g.nodes.map((n) =>
              n.id === currentDrag.nodeId
                ? ({
                    ...n,
                    x: gp.x - currentDrag.offsetX,
                    y: gp.y - currentDrag.offsetY,
                  } as GraphNode)
                : n
            ),
          }));
          return;
        }

        if (currentDrag.type === "connect") {
          setDrag((prev) =>
            prev.type === "connect" ? { ...prev, toX: gp.x, toY: gp.y } : prev
          );
        }
      };

      const onPointerUp = (e: PointerEvent) => {
        const currentDrag = dragRef.current;
        if (currentDrag.type === "connect") {
          const target = document.elementFromPoint(
            e.clientX,
            e.clientY
          ) as Element | null;
          const portEl = target?.closest?.(
            '[data-port="1"]'
          ) as HTMLElement | null;
          if (portEl) {
            const toNodeId = portEl.getAttribute("data-node-id");
            const toPortId = portEl.getAttribute("data-port-id");
            const toDirection = portEl.getAttribute("data-port-direction");
            if (toNodeId && toPortId && toDirection === "in") {
              createConnection(currentDrag.from, {
                nodeId: toNodeId,
                portId: toPortId,
              });
            }
          }
        }
        setDrag({ type: "none" });
      };

      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerup", onPointerUp, { passive: true });
      return () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };
    }, [drag.type]);

    function onKeyDown(e: React.KeyboardEvent) {
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
    }

    function createConnection(
      from: ConnectionEndpoint,
      to: ConnectionEndpoint
    ) {
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
    }

    function emitMidi(nodeId: NodeId, event: MidiEvent): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        setGraph((g) => {
          const next = routeMidi(g, nodeId, event);
          pendingMidiDispatchQueueRef.current.push({
            graph: next,
            nodeId,
            event,
            resolve,
            reject,
          });
          return next;
        });
      });
    }

    return (
      <div
        ref={rootRef}
        className={styles.root}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={() => rootRef.current?.focus()}
      >
        <div
          ref={worldRef}
          className={styles.world}
          style={{ width: worldSize.width, height: worldSize.height }}
        >
          <svg className={styles.canvas}>
            {renderCache.connections.map(({ connection: c, d }) => {
              const color = portKindColor(c.kind);
              const isSelected =
                selected.type === "connection" &&
                selected.connectionId === c.id;
              return (
                <g key={c.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={4}
                    style={{ cursor: "pointer" }}
                    pointerEvents="stroke"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      rootRef.current?.focus();
                      setSelected({ type: "connection", connectionId: c.id });
                    }}
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke={isSelected ? "#ffffff" : color}
                    strokeOpacity={isSelected ? 0.75 : 0.6}
                    strokeWidth={isSelected ? 2.25 : 2.25}
                    pointerEvents="none"
                  />
                </g>
              );
            })}

            {drag.type === "connect"
              ? (() => {
                  const fromNode = findNode(graph, drag.from.nodeId);
                  if (!fromNode) return null;
                  const ports = portMetaForNode(fromNode);
                  const fromPort = portById(fromNode, drag.from.portId);
                  if (!fromPort) return null;
                  const fromIndex = ports.findIndex(
                    (p) => p.id === fromPort.id
                  );
                  const width = nodeWidths[fromNode.id] ?? 240;
                  const x =
                    fromPort.direction === "in"
                      ? fromNode.x
                      : fromNode.x + width;
                  const y =
                    fromNode.y +
                    NODE_HEADER_HEIGHT +
                    fromIndex * PORT_ROW_HEIGHT +
                    PORT_ROW_HEIGHT / 2;
                  const d = bezierPath(x, y, drag.toX, drag.toY);
                  return (
                    <path
                      d={d}
                      fill="none"
                      stroke={portKindColor(drag.kind)}
                      strokeOpacity={0.5}
                      strokeWidth={2.25}
                      strokeDasharray="6 6"
                    />
                  );
                })()
              : null}
          </svg>

          <div className={styles.nodesLayer}>
            <div className={styles.nodesLayerInner}>
              {renderCache.nodes.map(({ node, def, ports, Ui }) => {
                const isSelected =
                  selected.type === "node" && selected.nodeId === node.id;

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
                  <div
                    key={node.id}
                    className={`${styles.node} ${
                      isSelected ? styles.nodeSelected : ""
                    }`}
                    data-node-id={node.id}
                    ref={(el) => {
                      const ro = resizeObserverRef.current;
                      if (!el) {
                        const prev = nodeElsRef.current.get(node.id);
                        if (prev && ro) ro.unobserve(prev);
                        nodeElsRef.current.delete(node.id);
                        return;
                      }
                      nodeElsRef.current.set(node.id, el);
                      if (ro) ro.observe(el);
                    }}
                    style={{
                      left: node.x,
                      top: node.y,
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelected({ type: "node", nodeId: node.id });
                    }}
                  >
                    <div
                      className={styles.nodeHeader}
                      onPointerDown={(e) => {
                        if (!rootRef.current) return;
                        e.stopPropagation();
                        setSelected({ type: "node", nodeId: node.id });
                        const p = localPointFromPointerEvent(
                          rootRef.current,
                          e
                        );
                        const gp = viewToWorld(
                          p,
                          scrollRef.current.x,
                          scrollRef.current.y
                        );
                        setDrag({
                          type: "moveNode",
                          nodeId: node.id,
                          offsetX: gp.x - node.x,
                          offsetY: gp.y - node.y,
                        });
                        (e.currentTarget as HTMLDivElement).setPointerCapture(
                          e.pointerId
                        );
                      }}
                      onPointerUp={(e) => {
                        (
                          e.currentTarget as HTMLDivElement
                        ).releasePointerCapture(e.pointerId);
                        setDrag({ type: "none" });
                      }}
                    >
                      <div className={styles.nodeTitle}>{def.title}</div>
                      <div className={styles.nodeIndicators}>
                        <div
                          className={`${styles.indicatorDot} ${
                            midiVisible ? styles.indicatorDotVisible : ""
                          }`}
                          style={{ background: portKindColor("midi") }}
                        />
                        <div
                          className={`${styles.indicatorDot} ${
                            meterVisible ? styles.indicatorDotVisible : ""
                          }`}
                          style={{
                            background: meterColor,
                            opacity: meterVisible ? meterOpacity : 0,
                          }}
                        />
                      </div>
                    </div>

                    <div className={styles.nodeBody}>
                      {ports.map((port, index) => {
                        const top =
                          index * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2;
                        const kindColor = portKindColor(port.kind);
                        const dotStyle: React.CSSProperties = {
                          borderColor: kindColor,
                        };
                        const dotDataProps = {
                          "data-port": "1",
                          "data-node-id": node.id,
                          "data-port-id": port.id,
                          "data-port-direction": port.direction,
                          "data-port-kind": port.kind,
                        } as const;

                        const onDotPointerDown = (e: React.PointerEvent) => {
                          e.stopPropagation();
                          if (!rootRef.current) return;
                          if (port.direction !== "out") return;
                          const p = localPointFromPointerEvent(
                            rootRef.current,
                            e
                          );
                          const gp = viewToWorld(
                            p,
                            scrollRef.current.x,
                            scrollRef.current.y
                          );
                          setDrag({
                            type: "connect",
                            from: { nodeId: node.id, portId: port.id },
                            kind: port.kind,
                            toX: gp.x,
                            toY: gp.y,
                          });
                        };

                        return (
                          <div
                            key={port.id}
                            className={`${styles.portRow} ${
                              port.direction === "in"
                                ? styles.portIn
                                : styles.portOut
                            }`}
                            style={{ top }}
                          >
                            <div
                              {...dotDataProps}
                              className={styles.portDot}
                              style={dotStyle}
                              onPointerDown={
                                port.direction === "out"
                                  ? onDotPointerDown
                                  : undefined
                              }
                            />
                            <div className={styles.portLabel}>{port.name}</div>
                          </div>
                        );
                      })}
                      <Ui
                        node={node}
                        onPatchNode={patchNode}
                        onEmitMidi={emitMidi}
                        debug={debug[node.id]}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className={styles.hud}>
          <div className={styles.hint}>
            Drag nodes. Drag from an output port to an input port to connect.
            Click a wire (or node header) and press Delete to remove.
          </div>
          {status ? <div className={styles.hint}>{status}</div> : null}
        </div>
      </div>
    );
  }
);
