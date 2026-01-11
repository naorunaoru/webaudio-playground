import type { GraphNode, MidiEvent, NodeId } from "../graph/types";

export type AudioNodeInstance<TNode extends GraphNode = GraphNode> = {
  readonly type: TNode["type"];
  updateState: (state: TNode["state"]) => void;
  getAudioInput?: (portId: string) => AudioNode | AudioParam | null;
  getAudioOutput?: (portId: string) => AudioNode | null;
  handleMidi?: (event: MidiEvent, portId: string | null, state: TNode["state"]) => void;
  onRemove?: () => void;
  getLevel?: () => number;
  getWaveform?: (length: number) => Float32Array | null;
  /** Runtime-only data for UI/telemetry; not persisted into the graph document. */
  getRuntimeState?: () => unknown;
  /** Called when connections to this node's ports change. */
  onConnectionsChanged?: (connected: { inputs: Set<string>; outputs: Set<string> }) => void;
};

export type AudioNodeFactory<TNode extends GraphNode = GraphNode> = Readonly<{
  type: TNode["type"];
  create: (ctx: AudioContext, nodeId: NodeId) => AudioNodeInstance<TNode>;
}>;
