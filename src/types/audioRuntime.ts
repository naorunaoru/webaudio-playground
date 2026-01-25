import type { GraphNode, GraphState, MidiEvent, NodeId, Timed, VoiceEvent } from "@graph/types";
import type { VoiceAllocator } from "@audio/voiceAllocator";
import type { VoiceMapping } from "@audio/voiceMapping";

/** Result from handleMidi indicating how the event should be routed. */
export type MidiHandleResult = {
  /** If true, don't route the original event to outgoing connections. */
  consumed?: boolean;
  /** New events to emit from this node (will be routed to outgoing connections). Timestamps are added automatically. */
  emit?: MidiEvent[];
};

export type AudioNodeInstance<TNode extends GraphNode = GraphNode> = {
  readonly type: TNode["type"];
  updateState: (state: TNode["state"]) => void;
  /**
   * Get audio input targets for a port. Returns array of N targets for N channels.
   * For mono ports, return a single-element array.
   */
  getAudioInputs?: (portId: string) => (AudioNode | AudioParam)[];
  /**
   * Get audio output nodes for a port. Returns array of N nodes for N channels.
   * For mono ports, return a single-element array.
   */
  getAudioOutputs?: (portId: string) => AudioNode[];
  /**
   * Handle incoming MIDI events.
   * Return a MidiHandleResult to control routing:
   * - consumed: true to prevent the original event from routing downstream
   * - emit: array of new events to emit from this node
   * Return void/undefined for default pass-through behavior.
   */
  handleMidi?: (event: Timed<MidiEvent>, portId: string | null, state: TNode["state"]) => MidiHandleResult | void;
  /** Handle incoming voice events (gate/trigger). */
  handleEvent?: (portId: string, event: VoiceEvent) => void;
  onRemove?: () => void;
  getLevel?: () => number;
  getWaveform?: (length: number) => Float32Array | null;
  /** Runtime-only data for UI/telemetry; not persisted into the graph document. */
  getRuntimeState?: () => unknown;
  /** Called when connections to this node's ports change. */
  onConnectionsChanged?: (connected: { inputs: Set<string>; outputs: Set<string> }) => void;
  /** Called by engine to provide current graph reference for event dispatch. */
  setGraphRef?: (graph: GraphState) => void;

  /** If this node owns a voice allocator, expose it for downstream discovery. */
  voiceAllocator?: VoiceAllocator;

  /** Get voice mapping for a specific output port (for pass-through nodes). */
  getVoiceMappingForOutput?: (portId: string) => VoiceMapping;
};

export type AudioNodeFactory<TNode extends GraphNode = GraphNode> = Readonly<{
  type: TNode["type"];
  create: (ctx: AudioContext, nodeId: NodeId) => AudioNodeInstance<TNode>;
}>;
