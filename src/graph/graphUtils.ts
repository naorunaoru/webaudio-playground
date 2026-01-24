import type {
  ConnectionEndpoint,
  GraphNode,
  GraphState,
  PortId,
  PortKind,
  PortSpec,
} from "./types";
import { getNodeDef } from "./nodeRegistry";
import { createId } from "./id";

/**
 * Check if two port kinds are compatible for connection.
 * - Audio-like (continuous signals): audio, cv, pitch can interconnect
 * - Event-like (discrete events): gate, trigger can interconnect
 * - MIDI: only connects to MIDI
 */
function areKindsCompatible(a: PortKind, b: PortKind): boolean {
  if (a === b) return true;

  const audioLike: PortKind[] = ["audio", "cv", "pitch"];
  if (audioLike.includes(a) && audioLike.includes(b)) return true;

  const eventLike: PortKind[] = ["gate", "trigger"];
  if (eventLike.includes(a) && eventLike.includes(b)) return true;

  return false;
}

export function portMetaForNode(node: GraphNode): readonly PortSpec[] {
  const def = getNodeDef(node.type);
  return def.ports(node as any);
}

export function findNode(
  graph: GraphState,
  nodeId: string
): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === nodeId);
}

export function portById(
  node: GraphNode,
  portId: PortId
): PortSpec | undefined {
  return portMetaForNode(node).find((p) => p.id === portId);
}

export function connectionKey(
  kind: PortKind,
  from: ConnectionEndpoint,
  to: ConnectionEndpoint
): string {
  return `${kind}:${from.nodeId}.${from.portId}->${to.nodeId}.${to.portId}`;
}

export function canConnect(
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
  if (!areKindsCompatible(fromPort.kind, toPort.kind))
    return { ok: false, reason: "kind mismatch" };

  const key = connectionKey(fromPort.kind, from, to);
  const exists = graph.connections.some(
    (c) => connectionKey(c.kind, c.from, c.to) === key
  );
  if (exists) return { ok: false, reason: "already connected" };
  return { ok: true, kind: fromPort.kind };
}

export function createNode<TType extends GraphNode["type"]>(
  type: TType,
  x: number,
  y: number,
  id?: string
): Extract<GraphNode, { type: TType }> {
  const def = getNodeDef(type);
  return {
    id: id ?? createId("n"),
    type,
    x,
    y,
    state: def.defaultState(),
  } as Extract<GraphNode, { type: TType }>;
}

/**
 * Returns the index of a port within its column (inputs or outputs).
 * Ports are rendered in two columns: inputs on the left, outputs on the right.
 */
export function portColumnIndex(
  ports: readonly PortSpec[],
  portId: PortId
): number {
  const port = ports.find((p) => p.id === portId);
  if (!port) return 0;
  const sameDirectionPorts = ports.filter((p) => p.direction === port.direction);
  return sameDirectionPorts.findIndex((p) => p.id === portId);
}

export function normalizeGraph(graph: GraphState): GraphState {
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
    if (!areKindsCompatible(fromPort.kind, toPort.kind)) return false;
    if (!areKindsCompatible(c.kind, fromPort.kind)) return false;
    return true;
  });

  return { ...graph, nodes, connections };
}
