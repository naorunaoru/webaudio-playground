import type { GraphNode, NodeId } from "../../graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "../../types/audioRuntime";
import type { AudioNodeServices } from "../../types/nodeModule";

type PmSinGraphNode = Extract<GraphNode, { type: "pmSin" }>;

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function rmsFromAnalyser(analyser: AnalyserNode, buffer: Float32Array<ArrayBufferLike>): number {
  analyser.getFloatTimeDomainData(buffer as any);
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const v = buffer[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / buffer.length);
}

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

