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
  if (fromPort.kind !== toPort.kind)
    return { ok: false, reason: "kind mismatch" };

  const key = connectionKey(fromPort.kind, from, to);
  const exists = graph.connections.some(
    (c) => connectionKey(c.kind, c.from, c.to) === key
  );
  if (exists) return { ok: false, reason: "already connected" };
  return { ok: true, kind: fromPort.kind };
}

export function createNode(
  type: GraphNode["type"],
  x: number,
  y: number
): GraphNode {
  const def = getNodeDef(type as any) as any;
  return { id: createId("n"), type, x, y, state: def.defaultState() };
}
