import type { GraphNode, NodeId } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";
import { clamp } from "@/utils/math";

type PmPhasorGraphNode = Extract<GraphNode, { type: "pmPhasor" }>;

function createPmPhasorRuntime(ctx: AudioContext, _nodeId: NodeId): AudioNodeInstance<PmPhasorGraphNode> {
  const node = new AudioWorkletNode(ctx, "pmPhasor", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });

  const frequencyParam = node.parameters.get("frequency") ?? null;
  const resetParam = node.parameters.get("reset") ?? null;
  const resetThresholdParam = node.parameters.get("resetThreshold") ?? null;

  return {
    type: "pmPhasor",
    updateState: (state) => {
      const now = ctx.currentTime;
      resetThresholdParam?.setTargetAtTime(clamp(state.resetThreshold, 0, 1), now, 0.02);
    },
    getAudioInput: (portId) => {
      if (portId === "freq_in") return frequencyParam;
      if (portId === "reset_in") return resetParam;
      return null;
    },
    getAudioOutput: (portId) => {
      if (portId === "phase_out") return node;
      return null;
    },
    onRemove: () => {
      node.disconnect();
    },
  };
}

export function pmPhasorAudioFactory(_services: AudioNodeServices): AudioNodeFactory<PmPhasorGraphNode> {
  return {
    type: "pmPhasor",
    create: (ctx, nodeId) => createPmPhasorRuntime(ctx, nodeId),
  };
}

