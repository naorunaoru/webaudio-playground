import type { GraphNode, NodeId } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";

type PitchRatioGraphNode = Extract<GraphNode, { type: "pitchRatio" }>;

const MAX_VOICES = 32;

function createPitchRatioRuntime(
  ctx: AudioContext,
  _nodeId: NodeId
): AudioNodeInstance<PitchRatioGraphNode> {
  // For each voice channel:
  // - Pitch input (pass-through)
  // - Constant offset: log2(numerator / denominator) in V/oct
  // - Sum to output
  //
  // Web Audio sums signals connected to the same destination.

  const pitchInputs: GainNode[] = [];
  const pitchOutputs: GainNode[] = [];
  const offsetSources: ConstantSourceNode[] = [];

  let currentNumerator = 1;
  let currentDenominator = 1;

  function computeVOctOffset(): number {
    // V/oct offset = log2(ratio)
    // ratio = numerator / denominator
    return Math.log2(currentNumerator / currentDenominator);
  }

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
    offset.offset.value = computeVOctOffset();
    offset.start();
    offsetSources.push(offset);

    // Connect: pitchIn + offset -> pitchOut
    pitchIn.connect(pitchOut);
    offset.connect(pitchOut);
  }

  return {
    type: "pitchRatio",
    updateState: (state) => {
      currentNumerator = state.numerator;
      currentDenominator = state.denominator;
      const vOctOffset = computeVOctOffset();
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

export function pitchRatioAudioFactory(
  _services: AudioNodeServices
): AudioNodeFactory<PitchRatioGraphNode> {
  return {
    type: "pitchRatio",
    create: (ctx, nodeId) => createPitchRatioRuntime(ctx, nodeId),
  };
}
