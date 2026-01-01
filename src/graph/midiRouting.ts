import type {
  GraphNode,
  GraphState,
  MidiEvent,
  NodeId,
  PortId,
  PortKind,
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
      const audioQueue: NodeId[] = [node.id];
      while (audioQueue.length > 0) {
        const currentNodeId = audioQueue.shift()!;
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
            audioQueue.push(conn.to.nodeId);
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
