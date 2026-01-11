import type { GraphNode, MidiEvent, NodeId } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";
import { clamp } from "@/utils/math";
import { rmsFromAnalyser } from "@/utils/audio";

type PmOscillatorGraphNode = Extract<GraphNode, { type: "pmOscillator" }>;

const A4_HZ = 440;

function midiToFreqHz(note: number, a4Hz: number): number {
  return a4Hz * Math.pow(2, (note - 69) / 12);
}

function createPmOscillatorRuntime(ctx: AudioContext, _nodeId: NodeId): AudioNodeInstance<PmOscillatorGraphNode> {
  const node = new AudioWorkletNode(ctx, "pmOscillator", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });

  const meter = ctx.createAnalyser();
  meter.fftSize = 256;
  meter.smoothingTimeConstant = 0.6;
  const meterBuffer = new Float32Array(meter.fftSize) as Float32Array<ArrayBufferLike>;

  node.connect(meter);

  const params = {
    ratio: 1,
    detuneCents: 0,
    feedback: 0,
    resetPhaseOnNoteOn: true,
  };

  const frequencyParam = node.parameters.get("frequency") ?? null;
  const feedbackParam = node.parameters.get("feedback") ?? null;

  function noteToFrequency(event: Extract<MidiEvent, { type: "noteOn" }>): number {
    const baseHz = midiToFreqHz(event.note, A4_HZ);
    const ratio = clamp(params.ratio, 0.25, 16);
    const detune = clamp(params.detuneCents, -1200, 1200);
    return baseHz * ratio * Math.pow(2, detune / 1200);
  }

  return {
    type: "pmOscillator",
    updateState: (state) => {
      const now = ctx.currentTime;
      params.ratio = state.ratio;
      params.detuneCents = state.detuneCents;
      params.feedback = state.feedback;
      params.resetPhaseOnNoteOn = state.resetPhaseOnNoteOn;

      feedbackParam?.setTargetAtTime(clamp(state.feedback, 0, 1), now, 0.01);
    },
    getAudioInput: (portId) => {
      if (portId === "phase_in") return node;
      return null;
    },
    getAudioOutput: (portId) => {
      if (portId === "audio_out") return meter;
      return null;
    },
    handleMidi: (event, portId, state) => {
      if (portId && portId !== "midi_in") return;
      if (event.type !== "noteOn") return;

      const now = ctx.currentTime;
      params.ratio = state.ratio;
      params.detuneCents = state.detuneCents;
      params.resetPhaseOnNoteOn = state.resetPhaseOnNoteOn;

      const hz = noteToFrequency(event);
      frequencyParam?.setValueAtTime(hz, now);

      if (state.resetPhaseOnNoteOn) {
        node.port.postMessage({ type: "resetPhase" });
      }
    },
    onRemove: () => {
      meter.disconnect();
      node.disconnect();
    },
    getLevel: () => rmsFromAnalyser(meter, meterBuffer),
  };
}

export function pmOscillatorAudioFactory(_services: AudioNodeServices): AudioNodeFactory<PmOscillatorGraphNode> {
  return {
    type: "pmOscillator",
    create: (ctx, nodeId) => createPmOscillatorRuntime(ctx, nodeId),
  };
}

