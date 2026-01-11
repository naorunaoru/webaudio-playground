import type { GraphNode, NodeId } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";
import { rmsFromAnalyser } from "@utils/audio";
import { clamp, quantize } from "@utils/math";

type ReverbGraphNode = Extract<GraphNode, { type: "reverb" }>;

function createImpulseResponse(
  ctx: BaseAudioContext,
  seconds: number,
  decay: number,
  reverse: boolean,
  channels: number,
): AudioBuffer {
  const length = Math.max(1, Math.floor(seconds * ctx.sampleRate));
  const buffer = ctx.createBuffer(channels, length, ctx.sampleRate);

  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = reverse ? length - 1 - i : i;
      const x = t / length;
      const env = Math.pow(1 - x, decay);
      data[i] = (Math.random() * 2 - 1) * env * 0.6;
    }
  }

  return buffer;
}

function createReverbRuntime(ctx: AudioContext, _nodeId: NodeId): AudioNodeInstance<ReverbGraphNode> {
  const input = ctx.createGain();
  const output = ctx.createGain();

  const preDelay = ctx.createDelay(1.0);
  const convolver = ctx.createConvolver();
  convolver.normalize = true;

  const wet = ctx.createGain();
  const dry = ctx.createGain();

  const meter = ctx.createAnalyser();
  meter.fftSize = 256;
  meter.smoothingTimeConstant = 0.6;
  const meterBuffer = new Float32Array(meter.fftSize) as Float32Array<ArrayBufferLike>;

  input.connect(dry);
  dry.connect(output);

  input.connect(preDelay);
  preDelay.connect(convolver);
  convolver.connect(wet);
  wet.connect(output);

  output.connect(meter);

  let lastIrKey: string | null = null;
  let lastIr: AudioBuffer | null = null;

  return {
    type: "reverb",
    updateState: (state) => {
      const now = ctx.currentTime;

      const seconds = clamp(state.seconds, 0.1, 10);
      const decay = clamp(state.decay, 0.1, 20);
      const preDelayMs = clamp(state.preDelayMs, 0, 1000);
      const mix = clamp(state.mix, 0, 1);
      const reverse = !!state.reverse;

      preDelay.delayTime.setTargetAtTime(preDelayMs / 1000, now, 0.01);
      wet.gain.setTargetAtTime(mix, now, 0.02);
      dry.gain.setTargetAtTime(1 - mix, now, 0.02);

      const channels = 2;
      const key = [
        ctx.sampleRate,
        channels,
        quantize(seconds, 0.01),
        quantize(decay, 0.01),
        reverse ? 1 : 0,
      ].join(":");

      if (key !== lastIrKey) {
        lastIrKey = key;
        lastIr = createImpulseResponse(ctx, seconds, decay, reverse, channels);
        convolver.buffer = lastIr;
      }
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
      convolver.disconnect();
      preDelay.disconnect();
      dry.disconnect();
      input.disconnect();
      lastIrKey = null;
      lastIr = null;
    },
    getLevel: () => rmsFromAnalyser(meter, meterBuffer),
  };
}

export function reverbAudioFactory(_services: AudioNodeServices): AudioNodeFactory<ReverbGraphNode> {
  return {
    type: "reverb",
    create: (ctx, nodeId) => createReverbRuntime(ctx, nodeId),
  };
}

