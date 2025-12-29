import type { GraphNode, NodeId } from "../../graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "../../types/audioRuntime";
import type { AudioNodeServices } from "../../types/nodeModule";

type GainGraphNode = Extract<GraphNode, { type: "gain" }>;

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

function createGainRuntime(ctx: AudioContext, _nodeId: NodeId): AudioNodeInstance<GainGraphNode> {
  const input = ctx.createGain();

  const vca = ctx.createGain();
  vca.gain.value = 0;

  const cv = ctx.createGain();
  cv.gain.value = 1;
  cv.connect(vca.gain);

  const meter = ctx.createAnalyser();
  meter.fftSize = 256;
  meter.smoothingTimeConstant = 0.6;
  const meterBuffer = new Float32Array(meter.fftSize) as Float32Array<ArrayBufferLike>;

  input.connect(vca);
  vca.connect(meter);

  return {
    type: "gain",
    updateState: (state) => {
      const now = ctx.currentTime;
      cv.gain.setTargetAtTime(clamp(state.depth, 0, 2), now, 0.02);
    },
    getAudioInput: (portId) => {
      if (portId === "audio_in") return input;
      if (portId === "gain_in") return cv;
      return null;
    },
    getAudioOutput: (portId) => {
      if (portId === "audio_out") return meter;
      return null;
    },
    onRemove: () => {
      meter.disconnect();
      vca.disconnect();
      input.disconnect();
      try {
        cv.disconnect();
      } catch {
        // ignore
      }
    },
    getLevel: () => rmsFromAnalyser(meter, meterBuffer),
  };
}

export function gainAudioFactory(_services: AudioNodeServices): AudioNodeFactory<GainGraphNode> {
  return {
    type: "gain",
    create: (ctx, nodeId) => createGainRuntime(ctx, nodeId),
  };
}

