import type { GraphNode, NodeId } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";
import { rmsFromAnalyser } from "@utils/audio";
import microDelayProcessorUrl from "./processor.ts?worklet";

type MicroDelayGraphNode = Extract<GraphNode, { type: "microDelay" }>;

const MAX_VOICES = 32;

const workletModuleLoadByContext = new WeakMap<AudioContext, Promise<void>>();

function ensureMicroDelayWorkletModuleLoaded(ctx: AudioContext): Promise<void> {
  const existing = workletModuleLoadByContext.get(ctx);
  if (existing) return existing;
  const p = ctx.audioWorklet.addModule(microDelayProcessorUrl);
  workletModuleLoadByContext.set(ctx, p);
  return p;
}

function createMicroDelayRuntime(
  ctx: AudioContext,
  _nodeId: NodeId
): AudioNodeInstance<MicroDelayGraphNode> {
  // Create N GainNodes as inputs (one per voice channel)
  const audioInputs: GainNode[] = [];
  for (let i = 0; i < MAX_VOICES; i++) {
    const input = ctx.createGain();
    input.gain.value = 1;
    audioInputs.push(input);
  }

  // ChannelMerger to combine N mono inputs into N-channel signal for worklet
  const inputMerger = ctx.createChannelMerger(MAX_VOICES);
  for (let i = 0; i < MAX_VOICES; i++) {
    audioInputs[i].connect(inputMerger, 0, i);
  }

  // ChannelSplitter to split N-channel worklet output into N mono outputs
  const outputSplitter = ctx.createChannelSplitter(MAX_VOICES);

  // Create N GainNodes as outputs (one per voice channel)
  const audioOutputs: GainNode[] = [];
  for (let i = 0; i < MAX_VOICES; i++) {
    const output = ctx.createGain();
    output.gain.value = 1;
    audioOutputs.push(output);
  }

  // Meter on combined output
  const meterMixer = ctx.createGain();
  meterMixer.gain.value = 1 / MAX_VOICES;
  const meter = ctx.createAnalyser();
  meter.fftSize = 256;
  meter.smoothingTimeConstant = 0.6;
  const meterBuffer = new Float32Array(meter.fftSize) as Float32Array<ArrayBufferLike>;
  meterMixer.connect(meter);

  // Connect splitter outputs to individual output gains and to meter
  for (let i = 0; i < MAX_VOICES; i++) {
    outputSplitter.connect(audioOutputs[i], i);
    outputSplitter.connect(meterMixer, i);
  }

  let worklet: AudioWorkletNode | null = null;
  let currentDelayMs = 0.02;

  const createWorklet = async () => {
    if (worklet) return;

    try {
      await ensureMicroDelayWorkletModuleLoaded(ctx);

      worklet = new AudioWorkletNode(ctx, "micro-delay", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [MAX_VOICES],
        channelCount: MAX_VOICES,
        channelCountMode: "explicit",
        channelInterpretation: "discrete",
      });

      // Send initial params
      worklet.port.postMessage({ type: "params", delayMs: currentDelayMs });

      // Connect: inputMerger -> worklet -> outputSplitter
      inputMerger.connect(worklet);
      worklet.connect(outputSplitter);
    } catch (e) {
      console.error("Failed to create MicroDelay worklet:", e);
    }
  };

  const destroyWorklet = () => {
    if (!worklet) return;
    try {
      inputMerger.disconnect(worklet);
      worklet.disconnect();
    } catch {
      // ignore
    }
    worklet = null;
  };

  let isConnected = false;

  return {
    type: "microDelay",
    updateState: (state) => {
      currentDelayMs = state.delayMs;
      worklet?.port.postMessage({ type: "params", delayMs: currentDelayMs });
    },
    getAudioInputs: (portId) => {
      if (portId === "audio_in") return audioInputs;
      return [];
    },
    getAudioOutputs: (portId) => {
      if (portId === "audio_out") return audioOutputs;
      return [];
    },
    onConnectionsChanged: ({ outputs }) => {
      const connected = outputs.has("audio_out");
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
        inputMerger.disconnect();
        for (const input of audioInputs) {
          input.disconnect();
        }
        for (const output of audioOutputs) {
          output.disconnect();
        }
      } catch {
        // ignore
      }
    },
    getLevel: () => rmsFromAnalyser(meter, meterBuffer),
  };
}

export function microDelayAudioFactory(
  _services: AudioNodeServices
): AudioNodeFactory<MicroDelayGraphNode> {
  return {
    type: "microDelay",
    create: (ctx, nodeId) => createMicroDelayRuntime(ctx, nodeId),
  };
}
