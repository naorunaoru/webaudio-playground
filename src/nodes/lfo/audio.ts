import type { GraphNode, NodeId, VoiceEvent } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";
import { rmsFromAnalyser } from "@utils/audio";
import lfoProcessorUrl from "./processor.ts?worklet";

type LfoGraphNode = Extract<GraphNode, { type: "lfo" }>;

const MAX_VOICES = 32;

const workletModuleLoadByContext = new WeakMap<AudioContext, Promise<void>>();

function ensureLfoWorkletModuleLoaded(ctx: AudioContext): Promise<void> {
  const existing = workletModuleLoadByContext.get(ctx);
  if (existing) return existing;
  const p = ctx.audioWorklet.addModule(lfoProcessorUrl);
  workletModuleLoadByContext.set(ctx, p);
  return p;
}

function createLfoRuntime(
  ctx: AudioContext,
  _nodeId: NodeId,
  _services: AudioNodeServices
): AudioNodeInstance<LfoGraphNode> {
  // ChannelSplitter to split N-channel worklet output into N mono outputs
  const outputSplitter = ctx.createChannelSplitter(MAX_VOICES);

  // Create N GainNodes as CV outputs (one per voice channel)
  const cvOutputs: GainNode[] = [];
  for (let i = 0; i < MAX_VOICES; i++) {
    const output = ctx.createGain();
    output.gain.value = 1;
    cvOutputs.push(output);
  }

  // Meter on combined output for level display
  const meterMixer = ctx.createGain();
  meterMixer.gain.value = 1 / MAX_VOICES;
  const meter = ctx.createAnalyser();
  meter.fftSize = 256;
  meter.smoothingTimeConstant = 0.6;
  const meterBuffer = new Float32Array(
    meter.fftSize
  ) as Float32Array<ArrayBufferLike>;
  meterMixer.connect(meter);

  // Connect splitter outputs to individual output gains and to meter
  for (let i = 0; i < MAX_VOICES; i++) {
    outputSplitter.connect(cvOutputs[i], i);
    outputSplitter.connect(meterMixer, i);
  }

  let worklet: AudioWorkletNode | null = null;
  let cachedState: LfoGraphNode["state"] | null = null;

  const createWorklet = async () => {
    if (worklet) return;

    try {
      await ensureLfoWorkletModuleLoaded(ctx);

      worklet = new AudioWorkletNode(ctx, "lfo", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [MAX_VOICES],
        channelCount: MAX_VOICES,
        channelCountMode: "explicit",
        channelInterpretation: "discrete",
      });

      // Send initial params if we have cached state
      if (cachedState) {
        worklet.port.postMessage({
          type: "params",
          waveform: cachedState.waveform,
          frequencyHz: cachedState.frequencyHz,
          rangeMin: cachedState.rangeMin,
          rangeMax: cachedState.rangeMax,
          oneShot: cachedState.oneShot,
        });
      }

      worklet.connect(outputSplitter);
    } catch (e) {
      console.error("Failed to create LFO worklet:", e);
    }
  };

  const destroyWorklet = () => {
    if (!worklet) return;
    try {
      worklet.disconnect();
    } catch {
      // ignore
    }
    worklet = null;
  };

  let isConnected = false;

  return {
    type: "lfo",

    updateState: (state) => {
      cachedState = state;
      worklet?.port.postMessage({
        type: "params",
        waveform: state.waveform,
        frequencyHz: state.frequencyHz,
        rangeMin: state.rangeMin,
        rangeMax: state.rangeMax,
        oneShot: state.oneShot,
      });
    },

    getAudioOutputs: (portId) => {
      // Return N GainNodes for the CV output - one per voice channel
      if (portId === "lfo_out") return cvOutputs;
      return [];
    },

    handleEvent: (portId, event: VoiceEvent) => {
      if (portId !== "trigger_in") return;

      // Trigger resets phase for specific voice
      if (
        event.type === "trigger" ||
        (event.type === "gate" && event.state === "on")
      ) {
        worklet?.port.postMessage({
          type: "trigger",
          voice: event.voice,
        });
      }
    },

    onConnectionsChanged: ({ outputs }) => {
      const connected = outputs.has("lfo_out");
      if (connected && !isConnected) {
        void createWorklet();
      } else if (!connected && isConnected) {
        destroyWorklet();
      }
      isConnected = connected;
    },

    onRemove: () => {
      destroyWorklet();
      try {
        meter.disconnect();
        meterMixer.disconnect();
        outputSplitter.disconnect();
        for (const output of cvOutputs) {
          output.disconnect();
        }
      } catch {
        // ignore
      }
    },

    getLevel: () => rmsFromAnalyser(meter, meterBuffer),
  };
}

export function lfoAudioFactory(
  services: AudioNodeServices
): AudioNodeFactory<LfoGraphNode> {
  return {
    type: "lfo",
    create: (ctx, nodeId) => createLfoRuntime(ctx, nodeId, services),
  };
}
