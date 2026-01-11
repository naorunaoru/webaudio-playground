import type { GraphNode, NodeId } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";
import { clamp } from "@/utils/math";
import { rmsFromAnalyser } from "@/utils/audio";

type PmSinGraphNode = Extract<GraphNode, { type: "pmSin" }>;

function createPmSinRuntime(ctx: AudioContext, _nodeId: NodeId): AudioNodeInstance<PmSinGraphNode> {
  const node = new AudioWorkletNode(ctx, "pmSin", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });

  const meter = ctx.createAnalyser();
  meter.fftSize = 256;
  meter.smoothingTimeConstant = 0.6;
  const meterBuffer = new Float32Array(meter.fftSize) as Float32Array<ArrayBufferLike>;

  node.connect(meter);

  const feedbackParam = node.parameters.get("feedback") ?? null;

  return {
    type: "pmSin",
    updateState: (state) => {
      const now = ctx.currentTime;
      feedbackParam?.setTargetAtTime(clamp(state.feedback, 0, 1), now, 0.02);
    },
    getAudioInput: (portId) => {
      if (portId === "phase_in") return node;
      return null;
    },
    getAudioOutput: (portId) => {
      if (portId === "audio_out") return meter;
      return null;
    },
    onRemove: () => {
      meter.disconnect();
      node.disconnect();
    },
    getLevel: () => rmsFromAnalyser(meter, meterBuffer),
  };
}

export function pmSinAudioFactory(_services: AudioNodeServices): AudioNodeFactory<PmSinGraphNode> {
  return {
    type: "pmSin",
    create: (ctx, nodeId) => createPmSinRuntime(ctx, nodeId),
  };
}

