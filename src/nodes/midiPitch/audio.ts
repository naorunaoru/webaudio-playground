import type { GraphNode, MidiEvent, NodeId } from "../../graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "../../types/audioRuntime";
import type { AudioNodeServices } from "../../types/nodeModule";

type MidiPitchGraphNode = Extract<GraphNode, { type: "midiPitch" }>;
type MidiPitchRuntimeState = MidiPitchGraphNode["state"];

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function midiToFreqHz(note: number, a4Hz: number): number {
  return a4Hz * Math.pow(2, (note - 69) / 12);
}

function computeHz(note: number, state: MidiPitchRuntimeState): number {
  const a4Hz = clamp(state.a4Hz, 200, 1000);
  const ratio = clamp(state.ratio, 0.25, 16);
  const detune = clamp(state.detuneCents, -1200, 1200);
  const base = midiToFreqHz(clamp(note, 0, 127), a4Hz);
  return base * ratio * Math.pow(2, detune / 1200);
}

function createMidiPitchRuntime(ctx: AudioContext, _nodeId: NodeId): AudioNodeInstance<MidiPitchGraphNode> {
  const hz = ctx.createConstantSource();
  hz.offset.value = 0;
  hz.start();

  const velocity = ctx.createConstantSource();
  velocity.offset.value = 0;
  velocity.start();

  const gate = ctx.createConstantSource();
  gate.offset.value = 0;
  gate.start();

  let lastNote: number | null = null;
  let lastVelocity: number | null = null;

  function applyPitch(event: Extract<MidiEvent, { type: "noteOn" }>, state: MidiPitchRuntimeState) {
    const now = ctx.currentTime;
    const glideSec = clamp(state.glideMs, 0, 5000) / 1000;
    const targetHz = computeHz(event.note, state);
    hz.offset.cancelScheduledValues(now);
    if (glideSec > 0) hz.offset.setTargetAtTime(targetHz, now, glideSec / 6);
    else hz.offset.setValueAtTime(targetHz, now);
  }

  return {
    type: "midiPitch",
    updateState: () => {},
    getAudioOutput: (portId) => {
      if (portId === "hz_out") return hz;
      if (portId === "vel_out") return velocity;
      if (portId === "gate_out") return gate;
      return null;
    },
    handleMidi: (event, portId, state) => {
      if (portId && portId !== "midi_in") return;
      const now = ctx.currentTime;

      if (event.type === "noteOn") {
        lastNote = event.note;
        lastVelocity = event.velocity;
        applyPitch(event, state);
        velocity.offset.setValueAtTime(clamp(event.velocity / 127, 0, 1), now);
        gate.offset.setValueAtTime(1, now);
        return;
      }

      if (event.type === "noteOff") {
        if (lastNote != null && event.note !== lastNote) return;
        gate.offset.setValueAtTime(0, now);
      }
    },
    onRemove: () => {
      try {
        hz.disconnect();
      } catch {
        // ignore
      }
      try {
        velocity.disconnect();
      } catch {
        // ignore
      }
      try {
        gate.disconnect();
      } catch {
        // ignore
      }
      try {
        hz.stop();
      } catch {
        // ignore
      }
      try {
        velocity.stop();
      } catch {
        // ignore
      }
      try {
        gate.stop();
      } catch {
        // ignore
      }
      lastNote = null;
      lastVelocity = null;
    },
    getRuntimeState: () => ({ lastNote, lastVelocity }),
  };
}

export function midiPitchAudioFactory(_services: AudioNodeServices): AudioNodeFactory<MidiPitchGraphNode> {
  return {
    type: "midiPitch",
    create: (ctx, nodeId) => createMidiPitchRuntime(ctx, nodeId),
  };
}

