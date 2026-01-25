import type { GraphNode, NodeId } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";
import { rmsFromAnalyser } from "@utils/audio";

type VcaGraphNode = Extract<GraphNode, { type: "vca" }>;

const MAX_VOICES = 32;

function createVcaRuntime(
  ctx: AudioContext,
  _nodeId: NodeId
): AudioNodeInstance<VcaGraphNode> {
  // For each voice channel, we need:
  // - Audio input GainNode
  // - CV input GainNode (controls the audio gain)
  // - Output GainNode
  //
  // Web Audio doesn't have a native VCA, but we can use GainNode.gain as an AudioParam
  // and connect CV to it. The CV will modulate the gain.

  const audioInputs: GainNode[] = [];
  const cvInputs: GainNode[] = [];
  const vcaGains: GainNode[] = []; // These are the actual VCAs
  const audioOutputs: GainNode[] = [];

  let baseGain = 1;

  for (let i = 0; i < MAX_VOICES; i++) {
    // Audio input
    const audioIn = ctx.createGain();
    audioIn.gain.value = 1;
    audioInputs.push(audioIn);

    // CV input - this will be connected to the VCA's gain param
    const cvIn = ctx.createGain();
    cvIn.gain.value = baseGain; // Scale CV by base gain
    cvInputs.push(cvIn);

    // VCA gain node - audio passes through, CV controls gain
    const vca = ctx.createGain();
    vca.gain.value = 0; // Start at 0, CV will control it
    vcaGains.push(vca);

    // Output
    const audioOut = ctx.createGain();
    audioOut.gain.value = 1;
    audioOutputs.push(audioOut);

    // Connect: audioIn -> vca -> audioOut
    audioIn.connect(vca);
    vca.connect(audioOut);

    // Connect CV to VCA's gain parameter
    cvIn.connect(vca.gain);
  }

  // Meter on combined output
  const meterMixer = ctx.createGain();
  meterMixer.gain.value = 1 / MAX_VOICES;
  const meter = ctx.createAnalyser();
  meter.fftSize = 256;
  meter.smoothingTimeConstant = 0.6;
  const meterBuffer = new Float32Array(meter.fftSize) as Float32Array<ArrayBufferLike>;
  meterMixer.connect(meter);

  for (const output of audioOutputs) {
    output.connect(meterMixer);
  }

  return {
    type: "vca",
    updateState: (state) => {
      baseGain = state.baseGain;
      // Update CV scaling
      for (const cvIn of cvInputs) {
        cvIn.gain.value = baseGain;
      }
    },
    getAudioInputs: (portId) => {
      if (portId === "audio_in") return audioInputs;
      if (portId === "cv_in") return cvInputs;
      return [];
    },
    getAudioOutputs: (portId) => {
      if (portId === "audio_out") return audioOutputs;
      return [];
    },
    onRemove: () => {
      try {
        meter.disconnect();
        meterMixer.disconnect();
        for (let i = 0; i < MAX_VOICES; i++) {
          audioInputs[i].disconnect();
          cvInputs[i].disconnect();
          vcaGains[i].disconnect();
          audioOutputs[i].disconnect();
        }
      } catch {
        // ignore
      }
    },
    getLevel: () => rmsFromAnalyser(meter, meterBuffer),
  };
}

export function vcaAudioFactory(
  _services: AudioNodeServices
): AudioNodeFactory<VcaGraphNode> {
  return {
    type: "vca",
    create: (ctx, nodeId) => createVcaRuntime(ctx, nodeId),
  };
}
