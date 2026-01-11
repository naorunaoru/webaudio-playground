import type { GraphNode, NodeId } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";

type AudioOutGraphNode = Extract<GraphNode, { type: "audioOut" }>;

function createAudioOutRuntime(
  ctx: AudioContext,
  masterInput: AudioNode,
  _nodeId: NodeId,
): AudioNodeInstance<AudioOutGraphNode> {
  const input = ctx.createGain();
  input.gain.value = 1;
  input.connect(masterInput);

  return {
    type: "audioOut",
    updateState: () => {},
    getAudioInput: (portId) => {
      if (portId === "audio_in") return input;
      return null;
    },
    onRemove: () => {
      input.disconnect();
    },
  };
}

export function audioOutAudioFactory(services: AudioNodeServices): AudioNodeFactory<AudioOutGraphNode> {
  return {
    type: "audioOut",
    create: (ctx, nodeId) => createAudioOutRuntime(ctx, services.masterInput, nodeId),
  };
}
