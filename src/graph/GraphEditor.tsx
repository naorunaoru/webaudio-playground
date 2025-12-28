import type React from "react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
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
  NODE_WIDTH,
  nodeHeight,
  portPosition,
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
      type: "pan";
      startClientX: number;
      startClientY: number;
      startPanX: number;
      startPanY: number;
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
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const def = getNodeDef(n.type as any) as any;
      if (!def.normalizeState) return n;
      return { ...n, state: def.normalizeState((n as any).state) };
    }),
    connections: graph.connections ?? [],
  };
}

function initialGraph(): GraphState {
  return {
    nodes: [
      { id: "n_midi", type: "midiSource", x: 40, y: 120, state: getNodeDef("midiSource").defaultState() } as any,
      { id: "n_cc", type: "ccSource", x: 40, y: 300, state: getNodeDef("ccSource").defaultState() } as any,
      { id: "n_osc", type: "oscillator", x: 340, y: 90, state: getNodeDef("oscillator").defaultState() } as any,
      { id: "n_out", type: "audioOut", x: 660, y: 150, state: getNodeDef("audioOut").defaultState() } as any,
    ],
    connections: [],
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
      const audioOut = graph.connections.filter(
        (c) => c.kind === "audio" && c.from.nodeId === node.id
      );
      for (const conn of audioOut) {
        nodePatches.set(conn.to.nodeId, {
          ...(nodePatches.get(conn.to.nodeId) ?? {}),
          lastAudioAtMs: event.atMs,
        });
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
  svg: SVGSVGElement,
  e: React.PointerEvent
): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function viewToGraph(p: { x: number; y: number }, panX: number, panY: number) {
  return { x: p.x - panX, y: p.y - panY };
}

function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(60, Math.abs(x2 - x1) * 0.5);
  const c1x = x1 + dx;
  const c2x = x2 - dx;
  return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
}

export type GraphEditorProps = Readonly<{
  audioState: AudioContextState | "off";
  onGraphChange?: (graph: GraphState) => void;
}>;

export type GraphEditorHandle = Readonly<{
  addNode: (type: GraphNode["type"]) => void;
  getGraph: () => GraphState;
}>;

export const GraphEditor = forwardRef<GraphEditorHandle, GraphEditorProps>(
  function GraphEditor({ audioState, onGraphChange }, ref) {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [graph, setGraph] = useState<GraphState>(
      () => loadGraphFromStorage() ?? initialGraph()
    );
    const [drag, setDrag] = useState<DragState>({ type: "none" });
    const [selected, setSelected] = useState<Selected>({ type: "none" });
    const [status, setStatus] = useState<string | null>(null);
    const [levels, setLevels] = useState<Record<string, number>>({});
    const [debug, setDebug] = useState<Record<string, unknown>>({});
    const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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
          const svg = svgRef.current;
          const rect = svg?.getBoundingClientRect();
          const baseX = rect ? rect.width * 0.5 - pan.x : 240;
          const baseY = rect ? rect.height * 0.5 - pan.y : 200;
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
      [graph, pan.x, pan.y]
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
      let raf = 0;
      const tick = () => {
        const engine = getAudioEngine();
        setLevels(engine.getLevels());
        setDebug(engine.getDebug());
        raf = window.requestAnimationFrame(tick);
      };
      if (audioState === "running") {
        raf = window.requestAnimationFrame(tick);
      } else {
        setLevels({});
        setDebug({});
      }
      return () => window.cancelAnimationFrame(raf);
    }, [audioState]);

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

    function onSvgPointerMove(e: React.PointerEvent) {
      if (!svgRef.current) return;
      if (drag.type === "none") return;
      const p = localPointFromPointerEvent(svgRef.current, e);
      if (drag.type === "pan") {
        setPan({
          x: drag.startPanX + (e.clientX - drag.startClientX),
          y: drag.startPanY + (e.clientY - drag.startClientY),
        });
        return;
      }
      const gp = viewToGraph(p, pan.x, pan.y);
      if (drag.type === "moveNode") {
        setGraph((g) => ({
          ...g,
          nodes: g.nodes.map((n) =>
            n.id === drag.nodeId
              ? ({
                  ...n,
                  x: gp.x - drag.offsetX,
                  y: gp.y - drag.offsetY,
                } as GraphNode)
              : n
          ),
        }));
        return;
      }
      if (drag.type === "connect") {
        setDrag({ ...drag, toX: gp.x, toY: gp.y });
      }
    }

    function onSvgPointerUp(e: React.PointerEvent) {
      if (drag.type === "pan") {
        setDrag({ type: "none" });
        return;
      }
      if (drag.type === "connect") {
        const target = e.target as Element | null;
        const portEl = target?.closest?.(
          '[data-port="1"]'
        ) as SVGElement | null;
        if (portEl) {
          const toNodeId = portEl.getAttribute("data-node-id");
          const toPortId = portEl.getAttribute("data-port-id");
          const toDirection = portEl.getAttribute("data-port-direction");
          if (toNodeId && toPortId && toDirection === "in") {
            createConnection(drag.from, { nodeId: toNodeId, portId: toPortId });
          }
        }
        setDrag({ type: "none" });
        return;
      }
      setDrag({ type: "none" });
    }

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

    function emitMidi(nodeId: NodeId, event: MidiEvent) {
      setGraph((g) => {
        const next = routeMidi(g, nodeId, event);
        getAudioEngine().dispatchMidi(next, nodeId, event);
        return next;
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
        <div className={styles.hud}>
          <div className={styles.hint}>
            Drag nodes. Drag from an output port to an input port to connect.
            Click a wire (or node header) and press Delete to remove.
          </div>
          {status ? <div className={styles.hint}>{status}</div> : null}
        </div>

        <svg
          ref={svgRef}
          className={styles.canvas}
          onPointerMove={onSvgPointerMove}
          onPointerUp={onSvgPointerUp}
          onPointerLeave={onSvgPointerUp}
        >
          <rect
            x={0}
            y={0}
            width="100%"
            height="100%"
            fill="transparent"
            style={{ cursor: drag.type === "pan" ? "grabbing" : "grab" }}
            onPointerDown={(e) => {
              e.stopPropagation();
              setSelected({ type: "none" });
              setDrag({
                type: "pan",
                startClientX: e.clientX,
                startClientY: e.clientY,
                startPanX: pan.x,
                startPanY: pan.y,
              });
              (e.currentTarget as SVGRectElement).setPointerCapture(
                e.pointerId
              );
            }}
            onPointerUp={(e) => {
              if (drag.type !== "pan") return;
              (e.currentTarget as SVGRectElement).releasePointerCapture(
                e.pointerId
              );
              setDrag({ type: "none" });
            }}
          />

          <defs>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow
                dx="0"
                dy="6"
                stdDeviation="8"
                floodColor="#000"
                floodOpacity="0.35"
              />
            </filter>
          </defs>

          <g transform={`translate(${pan.x}, ${pan.y})`}>
            {graph.connections.map((c) => {
              const fromNode = findNode(graph, c.from.nodeId);
              const toNode = findNode(graph, c.to.nodeId);
              if (!fromNode || !toNode) return null;
              const fromPorts = portMetaForNode(fromNode);
              const toPorts = portMetaForNode(toNode);
              const fromPort = portById(fromNode, c.from.portId);
              const toPort = portById(toNode, c.to.portId);
              if (!fromPort || !toPort) return null;
              const fromIndex = fromPorts.findIndex(
                (p) => p.id === fromPort.id
              );
              const toIndex = toPorts.findIndex((p) => p.id === toPort.id);
              const p1 = portPosition(
                fromNode,
                fromPort,
                fromIndex,
                fromPorts.length
              );
              const p2 = portPosition(toNode, toPort, toIndex, toPorts.length);
              const isSelected =
                selected.type === "connection" &&
                selected.connectionId === c.id;
              const color = portKindColor(c.kind);
              const d = bezierPath(p1.cx, p1.cy, p2.cx, p2.cy);
              return (
                <g key={c.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    style={{ cursor: "pointer" }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelected({ type: "connection", connectionId: c.id });
                    }}
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke={isSelected ? "#ffffff" : color}
                    strokeOpacity={isSelected ? 0.9 : 0.55}
                    strokeWidth={isSelected ? 3.25 : 2.25}
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
                  const p1 = portPosition(
                    fromNode,
                    fromPort,
                    fromIndex,
                    ports.length
                  );
                  const d = bezierPath(p1.cx, p1.cy, drag.toX, drag.toY);
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

            {graph.nodes.map((node) => {
              const def = getNodeDef(node.type);
              const ports = portMetaForNode(node);
              const height = nodeHeight(ports.length);
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  filter="url(#shadow)"
                >
                  <rect
                    x={0}
                    y={0}
                    width={NODE_WIDTH}
                    height={height}
                    rx={12}
                    fill="rgba(10, 12, 18, 0.75)"
                    stroke="rgba(255,255,255,0.12)"
                  />
                  <rect
                    x={0}
                    y={0}
                    width={NODE_WIDTH}
                    height={NODE_HEADER_HEIGHT}
                    rx={12}
                    fill="rgba(255,255,255,0.06)"
                    stroke="transparent"
                    style={{ cursor: "grab" }}
                    onPointerDown={(e) => {
                      if (!svgRef.current) return;
                      e.stopPropagation();
                      setSelected({ type: "node", nodeId: node.id });
                      const p = localPointFromPointerEvent(svgRef.current, e);
                      const gp = viewToGraph(p, pan.x, pan.y);
                      setDrag({
                        type: "moveNode",
                        nodeId: node.id,
                        offsetX: gp.x - node.x,
                        offsetY: gp.y - node.y,
                      });
                      (e.currentTarget as SVGRectElement).setPointerCapture(
                        e.pointerId
                      );
                    }}
                    onPointerUp={(e) => {
                      (e.currentTarget as SVGRectElement).releasePointerCapture(
                        e.pointerId
                      );
                      setDrag({ type: "none" });
                    }}
                  />
                  <text
                    x={12}
                    y={18}
                    fill="rgba(255,255,255,0.9)"
                    fontSize={12}
                    fontWeight={600}
                  >
                    {def.title}
                  </text>

                  {selected.type === "node" && selected.nodeId === node.id ? (
                    <rect
                      x={1.5}
                      y={1.5}
                      width={NODE_WIDTH - 3}
                      height={height - 3}
                      rx={12}
                      fill="transparent"
                      stroke="rgba(236, 239, 244, 0.35)"
                      strokeWidth={2}
                    />
                  ) : null}

                  {ports.map((port, index) => {
                    const isLeft = port.direction === "in";
                    const y =
                      NODE_HEADER_HEIGHT + NODE_PADDING + index * 20 + 10;
                    const x = isLeft ? 0 : NODE_WIDTH;
                    const labelX = isLeft ? -10 : NODE_WIDTH + 10;
                    const labelAnchor = isLeft ? "end" : "start";
                    const kindColor = portKindColor(port.kind);
                    return (
                      <g key={port.id}>
                        <circle
                          cx={x}
                          cy={y}
                          r={6}
                          data-port="1"
                          data-node-id={node.id}
                          data-port-id={port.id}
                          data-port-direction={port.direction}
                          data-port-kind={port.kind}
                          fill="rgba(255,255,255,0.08)"
                          stroke={kindColor}
                          strokeOpacity={0.8}
                          strokeWidth={2}
                          style={{
                            cursor:
                              port.direction === "out"
                                ? "crosshair"
                                : "default",
                          }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            if (!svgRef.current) return;
                            if (port.direction !== "out") return;
                            const p = localPointFromPointerEvent(
                              svgRef.current,
                              e
                            );
                            const gp = viewToGraph(p, pan.x, pan.y);
                            setDrag({
                              type: "connect",
                              from: { nodeId: node.id, portId: port.id },
                              kind: port.kind,
                              toX: gp.x,
                              toY: gp.y,
                            });
                          }}
                        />
                        <text
                          x={labelX}
                          y={y + 4}
                          fill="rgba(255,255,255,0.75)"
                          fontSize={11}
                          textAnchor={labelAnchor}
                        >
                          {port.name}
                        </text>
                      </g>
                    );
                  })}

                  {node.type === "midiSource" ? (
                    <circle
                      cx={NODE_WIDTH - 14}
                      cy={14}
                      r={5}
                      fill={portKindColor("midi")}
                      opacity={node.state.isEmitting ? 0.9 : 0}
                    />
                  ) : null}

                  {node.type !== "audioOut" && levels[node.id] != null
                    ? (() => {
                        const level = levels[node.id] ?? 0;
                        const normalized = Math.max(
                          0,
                          Math.min(1, level / 0.12)
                        );
                        const r = 3 + normalized * 4;
                        const opacity = normalized * 0.95;
                        return (
                          <circle
                            cx={NODE_WIDTH - 14}
                            cy={14}
                            r={r}
                            fill={portKindColor("audio")}
                            opacity={opacity}
                          />
                        );
                      })()
                    : null}

                  {node.type === "audioOut"
                    ? (() => {
                        const level = levels[node.id] ?? 0;
                        const normalized = Math.max(
                          0,
                          Math.min(1, level / 0.12)
                        );
                        const r = 3 + normalized * 4;
                        const opacity = 0.15 + normalized * 0.8;
                        return (
                          <circle
                            cx={NODE_WIDTH - 14}
                            cy={14}
                            r={r}
                            fill="rgba(236, 239, 244, 1)"
                            opacity={opacity}
                          />
                        );
                      })()
                    : null}
                </g>
              );
            })}
          </g>
        </svg>

        <div className={styles.uiLayer}>
          {graph.nodes.map((node) => {
            const def = getNodeDef(node.type);
            const ports = portMetaForNode(node);
            const height = nodeHeight(ports.length);
            const Ui = def.ui as any;
            return (
              <div
                key={node.id}
                className={styles.nodeUi}
                style={{
                  left: pan.x + node.x + NODE_PADDING,
                  top: pan.y + node.y + NODE_HEADER_HEIGHT + NODE_PADDING,
                  width: NODE_WIDTH - NODE_PADDING * 2,
                  height: Math.max(
                    0,
                    height - NODE_HEADER_HEIGHT - NODE_PADDING * 2
                  ),
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <Ui node={node} onPatchNode={patchNode} onEmitMidi={emitMidi} debug={debug[node.id]} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);
