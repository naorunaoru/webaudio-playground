import type { GraphNode, NodeId } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";

type PitchTransposeGraphNode = Extract<GraphNode, { type: "pitchTranspose" }>;

const MAX_VOICES = 32;

function createPitchTransposeRuntime(
  ctx: AudioContext,
  _nodeId: NodeId
): AudioNodeInstance<PitchTransposeGraphNode> {
  // For each voice channel:
  // - Pitch input (pass-through)
  // - Constant offset (semitones / 12 in V/oct)
  // - Sum to output
  //
  // Web Audio sums signals connected to the same destination.

  const pitchInputs: GainNode[] = [];
  const pitchOutputs: GainNode[] = [];
  const offsetSources: ConstantSourceNode[] = [];

  let currentSemitones = 0;

  for (let i = 0; i < MAX_VOICES; i++) {
    // Pitch input - pass through
    const pitchIn = ctx.createGain();
    pitchIn.gain.value = 1;
    pitchInputs.push(pitchIn);

    // Output summing node
    const pitchOut = ctx.createGain();
    pitchOut.gain.value = 1;
    pitchOutputs.push(pitchOut);

    // Constant offset source
    const offset = ctx.createConstantSource();
    offset.offset.value = currentSemitones / 12;
    offset.start();
    offsetSources.push(offset);

    // Connect: pitchIn + offset -> pitchOut
    pitchIn.connect(pitchOut);
    offset.connect(pitchOut);
  }

  return {
    type: "pitchTranspose",
    updateState: (state) => {
      currentSemitones = state.semitones;
      const vOctOffset = currentSemitones / 12;
      for (const offset of offsetSources) {
        offset.offset.value = vOctOffset;
      }
    },
    getAudioInputs: (portId) => {
      if (portId === "pitch_in") return pitchInputs;
      return [];
    },
    getAudioOutputs: (portId) => {
      if (portId === "pitch_out") return pitchOutputs;
      return [];
    },
    onRemove: () => {
      try {
        for (let i = 0; i < MAX_VOICES; i++) {
          pitchInputs[i].disconnect();
          pitchOutputs[i].disconnect();
          offsetSources[i].stop();
          offsetSources[i].disconnect();
        }
      } catch {
        // ignore
      }
    },
  };
}

export function pitchTransposeAudioFactory(
  _services: AudioNodeServices
): AudioNodeFactory<PitchTransposeGraphNode> {
  return {
    type: "pitchTranspose",
    create: (ctx, nodeId) => createPitchTransposeRuntime(ctx, nodeId),
  };
}
