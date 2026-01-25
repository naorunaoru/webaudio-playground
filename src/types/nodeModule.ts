import type { AudioGraphContext } from "@audio/context";
import type { GraphNode, GraphState, MidiEvent, NodeId, VoiceEvent } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "./audioRuntime";
import type { NodeDefinition } from "./graphNodeDefinition";

/** Callback to dispatch voice events (gate/trigger) from a node through the graph. */
export type DispatchEventFn = (
  graph: GraphState,
  sourceNodeId: NodeId,
  sourcePortId: string,
  event: VoiceEvent
) => void;

/** Callback to dispatch MIDI events from a node through the graph. */
export type DispatchMidiFn = (
  graph: GraphState,
  sourceNodeId: NodeId,
  event: MidiEvent
) => void;

export type AudioNodeServices = Readonly<{
  masterInput: AudioNode;
  graphContext: AudioGraphContext;
  /** Dispatch voice events to downstream nodes through the graph. */
  dispatchEvent: DispatchEventFn;
  /** Dispatch MIDI events to downstream nodes through the graph. */
  dispatchMidi: DispatchMidiFn;
  /** Look up an audio node instance by ID (for allocator discovery). */
  getAudioNode: (nodeId: NodeId) => AudioNodeInstance | undefined;
}>;

export type NodeModule<TNode extends GraphNode = GraphNode> = Readonly<{
  type: TNode["type"];
  graph: NodeDefinition<TNode>;
  audioFactory?: (services: AudioNodeServices) => AudioNodeFactory<TNode>;
  workletModules?: ReadonlyArray<string>;
}>;
