import type {
  GraphState,
  GraphNode,
  GraphConnection,
  NodeId,
  ConnectionId,
} from "@graph/types";
import type { GraphDoc, DocNode, DocConnection } from "./types";

/**
 * Convert GraphDoc (map-based) to GraphState (array-based) for UI and audio engine.
 */
export function docToGraphState(doc: GraphDoc): GraphState {
  const nodes: GraphNode[] = Object.values(doc.nodes).map(
    (n) =>
      ({
        id: n.id,
        type: n.type,
        x: n.x,
        y: n.y,
        state: n.state,
      }) as GraphNode
  );

  const connections: GraphConnection[] = Object.values(doc.connections).map(
    (c) => ({
      id: c.id,
      kind: c.kind,
      from: c.from,
      to: c.to,
    })
  );

  const zOrder = doc.nodeZOrder ?? {};
  return {
    nodes,
    connections,
    nodeZOrder: Object.keys(zOrder).length > 0 ? { ...zOrder } : undefined,
  };
}

/**
 * Convert GraphState (array-based) to GraphDoc (map-based) for Automerge storage.
 */
export function graphStateToDoc(graph: GraphState): GraphDoc {
  const nodes: Record<NodeId, DocNode> = {};
  for (const node of graph.nodes) {
    nodes[node.id] = {
      id: node.id,
      type: node.type,
      x: node.x,
      y: node.y,
      state: node.state as Record<string, unknown>,
    };
  }

  const connections: Record<ConnectionId, DocConnection> = {};
  for (const conn of graph.connections) {
    connections[conn.id] = {
      id: conn.id,
      kind: conn.kind,
      from: conn.from,
      to: conn.to,
    };
  }

  return {
    nodes,
    connections,
    nodeZOrder: graph.nodeZOrder ?? {},
    meta: {
      createdAt: Date.now(),
      lastModifiedAt: Date.now(),
    },
  };
}

/**
 * Create an empty GraphDoc.
 */
export function createEmptyDoc(): GraphDoc {
  return {
    nodes: {},
    connections: {},
    nodeZOrder: {},
    meta: {
      createdAt: Date.now(),
      lastModifiedAt: Date.now(),
    },
  };
}
