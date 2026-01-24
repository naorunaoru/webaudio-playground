import type { GraphNode, NodeId } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";
import { rmsFromAnalyser } from "@utils/audio";
import { clamp } from "@utils/math";

type FilterGraphNode = Extract<GraphNode, { type: "filter" }>;

export type FilterRuntimeState = {
  modulatedFrequency: number;
};

function createFilterRuntime(ctx: AudioContext, _nodeId: NodeId): AudioNodeInstance<FilterGraphNode> {
  const input = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  const freqCv = ctx.createGain();
  freqCv.gain.value = 0;
  freqCv.connect(filter.frequency);

  // Measure the CV signal going to filter.frequency
  const cvMeter = ctx.createAnalyser();
  cvMeter.fftSize = 256;
  cvMeter.smoothingTimeConstant = 0.8;
  const cvMeterBuffer = new Float32Array(cvMeter.fftSize) as Float32Array<ArrayBufferLike>;
  freqCv.connect(cvMeter);

  // Track base frequency for runtime state calculation
  let baseFrequency = 1200;

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

      baseFrequency = f;
      filter.frequency.setTargetAtTime(f, now, 0.02);
      filter.Q.setTargetAtTime(q, now, 0.02);
      freqCv.gain.setTargetAtTime(envAmount, now, 0.02);
    },
    getAudioInputs: (portId) => {
      if (portId === "audio_in") return [input];
      if (portId === "freq_in") return [freqCv];
      return [];
    },
    getAudioOutputs: (portId) => {
      if (portId === "audio_out") return [meter];
      return [];
    },
    onRemove: () => {
      meter.disconnect();
      filter.disconnect();
      input.disconnect();
      cvMeter.disconnect();
      try {
        freqCv.disconnect();
      } catch {
        // ignore
      }
    },
    getLevel: () => rmsFromAnalyser(meter, meterBuffer),
    getRuntimeState: (): FilterRuntimeState => {
      // Read the average value from the CV meter (envelope * envAmount)
      cvMeter.getFloatTimeDomainData(cvMeterBuffer as any);
      let sum = 0;
      for (let i = 0; i < cvMeterBuffer.length; i++) {
        sum += cvMeterBuffer[i] ?? 0;
      }
      const cvValue = sum / cvMeterBuffer.length;
      return { modulatedFrequency: baseFrequency + cvValue };
    },
  };
}

export function filterAudioFactory(_services: AudioNodeServices): AudioNodeFactory<FilterGraphNode> {
  return {
    type: "filter",
    create: (ctx, nodeId) => createFilterRuntime(ctx, nodeId),
  };
}

