export const PORT_KINDS = [
  "audio", // Continuous audio-rate signal (-1 to 1)
  "cv", // Continuous control voltage (0-1 or -1 to 1)
  "pitch", // V/oct pitch CV (continuous)
  "gate", // Event: on/off with duration (discrete)
  "trigger", // Event: instantaneous (discrete)
  "midi", // MIDI messages
] as const;

export type PortKind = (typeof PORT_KINDS)[number];

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
  /** Number of channels (1 = mono, N = poly). Per-port, not per-node. */
  channelCount?: number;
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

/** Adds a timestamp to an event type. */
export type Timed<T> = T & { atMs: number };

/** MIDI event. */
export type MidiEvent =
  | {
      type: "noteOn";
      note: number;
      velocity: number;
      channel: number;
    }
  | {
      type: "noteOff";
      note: number;
      channel: number;
    }
  | {
      type: "cc";
      controller: number;
      value: number; // 0..127
      channel: number;
    }
  | {
      type: "pitchBend";
      value: number; // -8192..8191 (14-bit, center = 0)
      channel: number;
    }
  | {
      type: "aftertouch";
      value: number; // 0..127 (channel pressure)
      channel: number;
    }
  | {
      type: "polyAftertouch";
      note: number;
      value: number; // 0..127
      channel: number;
    };

/** Gate event: state change with duration (on/off). */
export type GateEvent = Readonly<{
  type: "gate";
  voice: number;
  state: "on" | "off";
  time: number; // AudioContext.currentTime for sample-accurate scheduling
}>;

/** Trigger event: instantaneous event. */
export type TriggerEvent = Readonly<{
  type: "trigger";
  voice: number;
  time: number; // AudioContext.currentTime for sample-accurate scheduling
}>;

/**
 * Force release event: voice is being reclaimed due to voice stealing.
 * Consumers should immediately release their hold and fast-fade any active processing.
 */
export type ForceReleaseEvent = Readonly<{
  type: "force-release";
  voice: number;
  time: number; // AudioContext.currentTime for sample-accurate scheduling
}>;

/** Voice event: gate, trigger, or force-release. */
export type VoiceEvent = GateEvent | TriggerEvent | ForceReleaseEvent;

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
