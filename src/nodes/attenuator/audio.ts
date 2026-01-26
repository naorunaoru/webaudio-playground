import type { GraphNode, NodeId } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";

type AttenuatorGraphNode = Extract<GraphNode, { type: "attenuator" }>;

const MAX_VOICES = 32;

function createAttenuatorRuntime(
  ctx: AudioContext,
  _nodeId: NodeId
): AudioNodeInstance<AttenuatorGraphNode> {
  // Simple attenuator: input × amount = output
  // 32 voices for polyphony

  const inputs: GainNode[] = [];
  const outputs: GainNode[] = [];

  let currentAmount = 1;

  for (let i = 0; i < MAX_VOICES; i++) {
    // Each voice is just a GainNode
    const gain = ctx.createGain();
    gain.gain.value = currentAmount;
    inputs.push(gain);
    outputs.push(gain); // Same node for input and output
  }

  return {
    type: "attenuator",
    updateState: (state) => {
      currentAmount = state.amount;
      for (const gain of inputs) {
        gain.gain.value = currentAmount;
      }
    },
    getAudioInputs: (portId) => {
      if (portId === "in") return inputs;
      return [];
    },
    getAudioOutputs: (portId) => {
      if (portId === "out") return outputs;
      return [];
    },
    onRemove: () => {
      try {
        for (const gain of inputs) {
          gain.disconnect();
        }
      } catch {
        // ignore
      }
    },
  };
}

export function attenuatorAudioFactory(
  _services: AudioNodeServices
): AudioNodeFactory<AttenuatorGraphNode> {
  return {
    type: "attenuator",
    create: (ctx, nodeId) => createAttenuatorRuntime(ctx, nodeId),
  };
}
