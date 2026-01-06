import type {
  NodeId,
  ConnectionId,
  PortKind,
  ConnectionEndpoint,
} from "../graph/types";

/**
 * Automerge-optimized document structure.
 * Uses Records (maps) instead of arrays for efficient CRDT merging.
 */
export type GraphDoc = {
  /** Map from NodeId to DocNode */
  nodes: Record<NodeId, DocNode>;

  /** Map from ConnectionId to DocConnection */
  connections: Record<ConnectionId, DocConnection>;

  /** Map from NodeId to z-order index */
  nodeZOrder: Record<NodeId, number>;

  /** Document metadata */
  meta: DocMeta;
};

export type DocNode = {
  id: NodeId;
  type: string;
  x: number;
  y: number;
  state: Record<string, unknown>;
};

export type DocConnection = {
  id: ConnectionId;
  kind: PortKind;
  from: ConnectionEndpoint;
  to: ConnectionEndpoint;
};

export type DocMeta = {
  createdAt: number;
  lastModifiedAt: number;
};

/**
 * Mutation types for type-safe document updates.
 */
export type GraphMutation =
  | { type: "moveNode"; nodeId: NodeId; x: number; y: number }
  | { type: "addNode"; node: DocNode }
  | { type: "deleteNode"; nodeId: NodeId }
  | { type: "patchNode"; nodeId: NodeId; patch: Record<string, unknown> }
  | { type: "addConnection"; connection: DocConnection }
  | { type: "deleteConnection"; connectionId: ConnectionId }
  | { type: "setZOrder"; nodeId: NodeId; zIndex: number }
  | { type: "replaceAll"; doc: GraphDoc };
