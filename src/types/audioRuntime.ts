import type { GraphNode, MidiEvent, NodeId } from "../graph/types";

export type AudioNodeInstance<TNode extends GraphNode = GraphNode> = {
  readonly type: TNode["type"];
  updateState: (state: TNode["state"]) => void;
  getAudioInput?: (portId: string) => AudioNode | null;
  getAudioOutput?: (portId: string) => AudioNode | null;
  handleMidi?: (event: MidiEvent, portId: string | null, state: TNode["state"]) => void;
  onRemove?: () => void;
  getLevel?: () => number;
  getWaveform?: (length: number) => Float32Array | null;
};

export type AudioNodeFactory<TNode extends GraphNode = GraphNode> = Readonly<{
  type: TNode["type"];
  create: (ctx: AudioContext, nodeId: NodeId) => AudioNodeInstance<TNode>;
}>;

