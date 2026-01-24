import type {
  GraphNode,
  GraphState,
  MidiEvent,
  NodeId,
  PortId,
} from "./types";
import { getNodeDef } from "./nodeRegistry";
import { findNode } from "./graphUtils";

type MidiDelivery = { nodeId: NodeId; portId: PortId | null };

export function routeMidi(
  graph: GraphState,
  sourceNodeId: NodeId,
  event: MidiEvent
): GraphState {
  const seen = new Set<string>();
  const queue: MidiDelivery[] = [];
  const nodePatches = new Map<NodeId, Partial<any>>();

  // All MIDI events route through 'midi' edges
  const starts = graph.connections.filter(
    (c) => c.kind === "midi" && c.from.nodeId === sourceNodeId
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

    const outgoing = graph.connections.filter(
      (c) => c.kind === "midi" && c.from.nodeId === node.id
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

/**
 * Compute MIDI routing patches without applying them to the graph.
 * Returns a Map of nodeId -> state patch.
 */
export function computeMidiPatches(
  graph: GraphState,
  sourceNodeId: NodeId,
  event: MidiEvent
): Map<NodeId, Record<string, unknown>> {
  const seen = new Set<string>();
  const queue: MidiDelivery[] = [];
  const nodePatches = new Map<NodeId, Record<string, unknown>>();

  // All MIDI events route through 'midi' edges
  const starts = graph.connections.filter(
    (c) => c.kind === "midi" && c.from.nodeId === sourceNodeId
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

    const outgoing = graph.connections.filter(
      (c) => c.kind === "midi" && c.from.nodeId === node.id
    );
    for (const conn of outgoing)
      queue.push({ nodeId: conn.to.nodeId, portId: conn.to.portId });
  }

  return nodePatches;
}
