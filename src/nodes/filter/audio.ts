import type { GraphNode, NodeId } from "../../graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "../../types/audioRuntime";
import type { AudioNodeServices } from "../../types/nodeModule";

type FilterGraphNode = Extract<GraphNode, { type: "filter" }>;

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

function createFilterRuntime(ctx: AudioContext, _nodeId: NodeId): AudioNodeInstance<FilterGraphNode> {
  const input = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  const freqCv = ctx.createGain();
  freqCv.gain.value = 0;
  freqCv.connect(filter.frequency);

  const meter = ctx.createAnalyser();
  meter.fftSize = 256;
  meter.smoothingTimeConstant = 0.6;
  const meterBuffer = new Float32Array(meter.fftSize) as Float32Array<ArrayBufferLike>;

  input.connect(filter);
  filter.connect(meter);

  return {
    type: "filter",
    updateState: (state) => {
      const now = ctx.currentTime;
      filter.type = state.type;

      const nyquist = ctx.sampleRate * 0.5;
      const f = clamp(state.frequencyHz, 20, Math.max(20, nyquist - 10));
      const q = clamp(state.q, 0.0001, 30);
      const envAmount = clamp(state.envAmountHz, 0, Math.max(0, nyquist - 10));

      filter.frequency.setTargetAtTime(f, now, 0.02);
      filter.Q.setTargetAtTime(q, now, 0.02);
      freqCv.gain.setTargetAtTime(envAmount, now, 0.02);
    },
    getAudioInput: (portId) => {
      if (portId === "audio_in") return input;
      if (portId === "freq_in") return freqCv;
      return null;
    },
    getAudioOutput: (portId) => {
      if (portId === "audio_out") return meter;
      return null;
    },
    onRemove: () => {
      meter.disconnect();
      filter.disconnect();
      input.disconnect();
      try {
        freqCv.disconnect();
      } catch {
        // ignore
      }
    },
    getLevel: () => rmsFromAnalyser(meter, meterBuffer),
  };
}

export function filterAudioFactory(_services: AudioNodeServices): AudioNodeFactory<FilterGraphNode> {
  return {
    type: "filter",
    create: (ctx, nodeId) => createFilterRuntime(ctx, nodeId),
  };
}

