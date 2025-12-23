import type { GraphNode, NodeId } from "../../graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "../../types/audioRuntime";
import type { AudioNodeServices } from "../../types/nodeModule";

type DelayGraphNode = Extract<GraphNode, { type: "delay" }>;

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

function createDelayRuntime(ctx: AudioContext, _nodeId: NodeId): AudioNodeInstance<DelayGraphNode> {
  const input = ctx.createGain();
  const output = ctx.createGain();

  const delay = ctx.createDelay(5.0);
  const feedback = ctx.createGain();
  const wet = ctx.createGain();
  const dry = ctx.createGain();

  const meter = ctx.createAnalyser();
  meter.fftSize = 256;
  meter.smoothingTimeConstant = 0.6;
  const meterBuffer = new Float32Array(meter.fftSize) as Float32Array<ArrayBufferLike>;

  input.connect(dry);
  dry.connect(output);

  input.connect(delay);
  delay.connect(wet);
  wet.connect(output);

  delay.connect(feedback);
  feedback.connect(delay);

  output.connect(meter);

  return {
    type: "delay",
    updateState: (state) => {
      const now = ctx.currentTime;
      const delayMs = clamp(state.delayMs, 0, 5000);
      const feedbackGain = clamp(state.feedback, 0, 0.98);
      const mix = clamp(state.mix, 0, 1);

      delay.delayTime.setTargetAtTime(delayMs / 1000, now, 0.015);
      feedback.gain.setTargetAtTime(feedbackGain, now, 0.02);
      wet.gain.setTargetAtTime(mix, now, 0.02);
      dry.gain.setTargetAtTime(1 - mix, now, 0.02);
    },
    getAudioInput: (portId) => {
      if (portId === "audio_in") return input;
      return null;
    },
    getAudioOutput: (portId) => {
      if (portId === "audio_out") return meter;
      return null;
    },
    onRemove: () => {
      meter.disconnect();
      output.disconnect();
      wet.disconnect();
      dry.disconnect();
      feedback.disconnect();
      delay.disconnect();
      input.disconnect();
    },
    getLevel: () => rmsFromAnalyser(meter, meterBuffer),
  };
}

export function delayAudioFactory(_services: AudioNodeServices): AudioNodeFactory<DelayGraphNode> {
  return {
    type: "delay",
    create: (ctx, nodeId) => createDelayRuntime(ctx, nodeId),
  };
}

