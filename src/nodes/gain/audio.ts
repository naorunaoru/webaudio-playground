import type { GraphNode, NodeId } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";
import { clamp } from "@/utils/math";
import { rmsFromAnalyser } from "@/utils/audio";

type GainGraphNode = Extract<GraphNode, { type: "gain" }>;

export type GainRuntimeState = {
  modulatedCv: number;
};

function createGainRuntime(ctx: AudioContext, _nodeId: NodeId): AudioNodeInstance<GainGraphNode> {
  const input = ctx.createGain();

  const vca = ctx.createGain();
  vca.gain.value = 0;

  const base = ctx.createConstantSource();
  base.offset.value = 0;
  base.connect(vca.gain);
  base.start();

  const cvIn = ctx.createGain();
  cvIn.gain.value = 1;
  const cvAmount = ctx.createGain();
  cvAmount.gain.value = 1;
  cvIn.connect(cvAmount);
  cvAmount.connect(vca.gain);

  // Meter to read the CV signal (cvIn * depth)
  const cvMeter = ctx.createAnalyser();
  cvMeter.fftSize = 256;
  cvMeter.smoothingTimeConstant = 0.8;
  const cvMeterBuffer = new Float32Array(cvMeter.fftSize) as Float32Array<ArrayBufferLike>;
  cvAmount.connect(cvMeter);

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
      base.offset.setTargetAtTime(clamp(state.base, 0, 2), now, 0.02);
      cvAmount.gain.setTargetAtTime(clamp(state.depth, 0, 2), now, 0.02);
    },
    getAudioInputs: (portId) => {
      if (portId === "audio_in") return [input];
      if (portId === "gain_in") return [cvIn];
      return [];
    },
    getAudioOutputs: (portId) => {
      if (portId === "audio_out") return [meter];
      return [];
    },
    onRemove: () => {
      meter.disconnect();
      cvMeter.disconnect();
      vca.disconnect();
      input.disconnect();
      try {
        cvAmount.disconnect();
      } catch {
        // ignore
      }
      try {
        cvIn.disconnect();
      } catch {
        // ignore
      }
      try {
        base.disconnect();
      } catch {
        // ignore
      }
      try {
        base.stop();
      } catch {
        // ignore
      }
    },
    getLevel: () => rmsFromAnalyser(meter, meterBuffer),
    getRuntimeState: (): GainRuntimeState => {
      cvMeter.getFloatTimeDomainData(cvMeterBuffer as any);
      let sum = 0;
      for (let i = 0; i < cvMeterBuffer.length; i++) {
        sum += cvMeterBuffer[i] ?? 0;
      }
      return { modulatedCv: sum / cvMeterBuffer.length };
    },
  };
}

export function gainAudioFactory(_services: AudioNodeServices): AudioNodeFactory<GainGraphNode> {
  return {
    type: "gain",
    create: (ctx, nodeId) => createGainRuntime(ctx, nodeId),
  };
}
