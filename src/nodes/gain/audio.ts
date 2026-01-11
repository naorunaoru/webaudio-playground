import type { GraphNode, NodeId } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";
import { rmsFromAnalyser } from "@utils/audio";
import { clamp } from "@utils/math";

type GainGraphNode = Extract<GraphNode, { type: "gain" }>;

export type GainRuntimeState = {
  modulatedGain: number;
};

function createGainRuntime(ctx: AudioContext, _nodeId: NodeId): AudioNodeInstance<GainGraphNode> {
  const input = ctx.createGain();

  const vca = ctx.createGain();
  vca.gain.value = 0;

  const cv = ctx.createGain();
  cv.gain.value = 1;
  cv.connect(vca.gain);

  // Provide a constant 1.0 signal so that when no automation is connected,
  // the gain equals depth. When automation is connected, disconnect this.
  const constantOne = ctx.createConstantSource();
  constantOne.offset.value = 1;
  constantOne.connect(cv);
  constantOne.start();
  let constantConnected = true;

  // Measure the CV signal going to vca.gain
  // We tap cv's output which carries: (envelope_input * depth)
  const cvMeter = ctx.createAnalyser();
  cvMeter.fftSize = 256;
  cvMeter.smoothingTimeConstant = 0.8;
  const cvMeterBuffer = new Float32Array(cvMeter.fftSize) as Float32Array<ArrayBufferLike>;
  cv.connect(cvMeter);

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
      cvMeter.disconnect();
      try {
        constantOne.stop();
        constantOne.disconnect();
        cv.disconnect();
      } catch {
        // ignore
      }
    },
    getLevel: () => rmsFromAnalyser(meter, meterBuffer),
    onConnectionsChanged: ({ inputs }) => {
      const hasGainIn = inputs.has("gain_in");
      if (hasGainIn && constantConnected) {
        // Automation connected, disconnect the constant source
        constantOne.disconnect(cv);
        constantConnected = false;
      } else if (!hasGainIn && !constantConnected) {
        // Automation disconnected, reconnect the constant source
        constantOne.connect(cv);
        constantConnected = true;
      }
    },
    getRuntimeState: (): GainRuntimeState => {
      // Read the average value from the CV meter (envelope * depth)
      cvMeter.getFloatTimeDomainData(cvMeterBuffer as any);
      let sum = 0;
      for (let i = 0; i < cvMeterBuffer.length; i++) {
        sum += cvMeterBuffer[i] ?? 0;
      }
      return { modulatedGain: sum / cvMeterBuffer.length };
    },
  };
}

export function gainAudioFactory(_services: AudioNodeServices): AudioNodeFactory<GainGraphNode> {
  return {
    type: "gain",
    create: (ctx, nodeId) => createGainRuntime(ctx, nodeId),
  };
}

