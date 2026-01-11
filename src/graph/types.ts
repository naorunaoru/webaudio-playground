export type PortKind = "audio" | "midi" | "cc" | "automation";
export type PortDirection = "in" | "out";

// Augment this interface from `src/nodes/<node>/types.ts` to register new node types.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface NodeTypeMap {}

export type NodeType = keyof NodeTypeMap & string;

export type NodeId = string;
export type ConnectionId = string;

export type PortId = string;

export type PortSpec = Readonly<{
  id: PortId;
  name: string;
  kind: PortKind;
  direction: PortDirection;
}>;

export type ConnectionEndpoint = Readonly<{
  nodeId: NodeId;
  portId: PortId;
}>;

export type GraphConnection = Readonly<{
  id: ConnectionId;
  kind: PortKind;
  from: ConnectionEndpoint;
  to: ConnectionEndpoint;
}>;

export type GraphNodeBase<TType extends string, TState> = Readonly<{
  id: NodeId;
  type: TType;
  x: number;
  y: number;
  state: TState;
}>;

export type GraphNodeBaseUntyped = GraphNodeBase<string, unknown>;

export type GraphNode = {
  [K in keyof NodeTypeMap & string]: GraphNodeBase<K, NodeTypeMap[K]>;
}[keyof NodeTypeMap & string];

export type GraphState = {
  nodes: GraphNode[];
  connections: GraphConnection[];
  nodeZOrder?: Record<NodeId, number>;
};

export type MidiEvent =
  | {
      type: "noteOn";
      note: number;
      velocity: number;
      channel: number;
      atMs: number;
    }
  | {
      type: "noteOff";
      note: number;
      channel: number;
      atMs: number;
    }
  | {
      type: "cc";
      controller: number;
      value: number; // 0..127
      channel: number;
      atMs: number;
    };

export type DragState =
  | { type: "none" }
  | {
      type: "moveNodes";
      nodeOffsets: Map<NodeId, { offsetX: number; offsetY: number }>;
    }
  | {
      type: "connect";
      from: ConnectionEndpoint;
      kind: PortKind;
      toX: number;
      toY: number;
    }
  | {
      type: "marquee";
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
    };

export type Selected =
  | { type: "none" }
  | { type: "nodes"; nodeIds: Set<NodeId> }
  | { type: "connection"; connectionId: ConnectionId };
