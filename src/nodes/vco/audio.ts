import type { AudioGraphContext } from "@audio/context";
import type { GraphNode, NodeId } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";
import vcoProcessorUrl from "./processor.ts?worklet";

type VcoGraphNode = Extract<GraphNode, { type: "vco" }>;

const MAX_VOICES = 32;

const workletModuleLoadByContext = new WeakMap<AudioContext, Promise<void>>();

function ensureVcoWorkletModuleLoaded(ctx: AudioContext): Promise<void> {
  const existing = workletModuleLoadByContext.get(ctx);
  if (existing) return existing;
  const p = ctx.audioWorklet.addModule(vcoProcessorUrl);
  workletModuleLoadByContext.set(ctx, p);
  return p;
}

function createVcoRuntime(
  ctx: AudioContext,
  _nodeId: NodeId,
  graphContext: AudioGraphContext
): AudioNodeInstance<VcoGraphNode> {
  // Create N GainNodes as pitch inputs (one per voice channel)
  const pitchInputs: GainNode[] = [];
  for (let i = 0; i < MAX_VOICES; i++) {
    const input = ctx.createGain();
    input.gain.value = 1;
    pitchInputs.push(input);
  }

  // ChannelMerger to combine N mono inputs into N-channel signal for worklet
  const pitchMerger = ctx.createChannelMerger(MAX_VOICES);
  for (let i = 0; i < MAX_VOICES; i++) {
    pitchInputs[i].connect(pitchMerger, 0, i);
  }

  // Create N GainNodes as phase modulation inputs (one per voice channel)
  const phaseModInputs: GainNode[] = [];
  for (let i = 0; i < MAX_VOICES; i++) {
    const input = ctx.createGain();
    input.gain.value = 1;
    phaseModInputs.push(input);
  }

  // ChannelMerger to combine N mono phase mod inputs into N-channel signal for worklet
  const phaseModMerger = ctx.createChannelMerger(MAX_VOICES);
  for (let i = 0; i < MAX_VOICES; i++) {
    phaseModInputs[i].connect(phaseModMerger, 0, i);
  }

  // ChannelSplitter to split N-channel worklet output into N mono outputs
  const outputSplitter = ctx.createChannelSplitter(MAX_VOICES);

  // Create N GainNodes as audio outputs (one per voice channel)
  const audioOutputs: GainNode[] = [];
  for (let i = 0; i < MAX_VOICES; i++) {
    const output = ctx.createGain();
    output.gain.value = 1;
    audioOutputs.push(output);
  }

  // Connect splitter outputs to individual output gains
  for (let i = 0; i < MAX_VOICES; i++) {
    outputSplitter.connect(audioOutputs[i], i);
  }

  let worklet: AudioWorkletNode | null = null;
  let currentWaveform: VcoGraphNode["state"]["waveform"] = "sawtooth";

  // Track A4 and send to worklet
  let currentA4 = graphContext.getValues().a4Hz;
  const unsubscribeA4 = graphContext.subscribe("a4Hz", (a4Hz) => {
    currentA4 = a4Hz;
    worklet?.port.postMessage({ type: "setA4", a4Hz });
  });

  // Create worklet when connected
  const createWorklet = async () => {
    if (worklet) return;

    try {
      await ensureVcoWorkletModuleLoaded(ctx);

      worklet = new AudioWorkletNode(ctx, "vco", {
        numberOfInputs: 2, // pitch CV + phase modulation
        numberOfOutputs: 1,
        outputChannelCount: [MAX_VOICES],
        channelCount: MAX_VOICES,
        channelCountMode: "explicit",
        channelInterpretation: "discrete",
      });

      // Send initial params
      worklet.port.postMessage({ type: "params", waveform: currentWaveform });
      worklet.port.postMessage({ type: "setA4", a4Hz: currentA4 });

      // Connect: pitchMerger -> worklet input 0, phaseModMerger -> worklet input 1
      pitchMerger.connect(worklet, 0, 0);
      phaseModMerger.connect(worklet, 0, 1);
      worklet.connect(outputSplitter);
    } catch (e) {
      console.error("Failed to create VCO worklet:", e);
    }
  };

  const destroyWorklet = () => {
    if (!worklet) return;
    try {
      pitchMerger.disconnect(worklet);
      phaseModMerger.disconnect(worklet);
      worklet.disconnect();
    } catch {
      // ignore
    }
    worklet = null;
  };

  let isConnected = false;

  return {
    type: "vco",
    updateState: (state) => {
      currentWaveform = state.waveform;
      worklet?.port.postMessage({ type: "params", waveform: currentWaveform });
    },
    getAudioInputs: (portId) => {
      // Return N GainNodes for the pitch input - one per voice channel
      if (portId === "pitch_in") return pitchInputs;
      // Return N GainNodes for the phase modulation input - one per voice channel
      if (portId === "phase_mod_in") return phaseModInputs;
      return [];
    },
    getAudioOutputs: (portId) => {
      // Return N GainNodes for the audio output - one per voice channel
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
      unsubscribeA4();
      destroyWorklet();
      try {
        outputSplitter.disconnect();
        pitchMerger.disconnect();
        phaseModMerger.disconnect();
        for (const input of pitchInputs) {
          input.disconnect();
        }
        for (const input of phaseModInputs) {
          input.disconnect();
        }
        for (const output of audioOutputs) {
          output.disconnect();
        }
      } catch {
        // ignore
      }
    },
    getLevel: () => (worklet ? 1 : 0),
  };
}

export function vcoAudioFactory(
  services: AudioNodeServices
): AudioNodeFactory<VcoGraphNode> {
  return {
    type: "vco",
    create: (ctx, nodeId) => createVcoRuntime(ctx, nodeId, services.graphContext),
  };
}
