import type { GraphNode, MidiEvent, NodeId } from "../../graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "../../types/audioRuntime";
import type { AudioNodeServices } from "../../types/nodeModule";

type EnvelopeGraphNode = Extract<GraphNode, { type: "envelope" }>;
type EnvelopeRuntimeState = EnvelopeGraphNode["state"];

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function createEnvelopeRuntime(ctx: AudioContext, _nodeId: NodeId): AudioNodeInstance<EnvelopeGraphNode> {
  const source = ctx.createConstantSource();
  source.offset.value = 1;

  const amp = ctx.createGain();
  amp.gain.value = 0;

  source.connect(amp);
  source.start();

  let currentNote: number | null = null;

  function applyEnvelopeNoteOn(
    event: Extract<MidiEvent, { type: "noteOn" }>,
    state: EnvelopeRuntimeState,
  ) {
    const now = ctx.currentTime;
    const epsilon = 0.0001;

    const peak = clamp01(event.velocity / 127);
    const env = state.env;
    const a = Math.max(0, env.attackMs) / 1000;
    const d = Math.max(0, env.decayMs) / 1000;
    const s = clamp01(env.sustain);
    const sustainLevel = Math.max(epsilon, peak * s);

    const g = amp.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(epsilon, g.value), now);

    const tA = now + a;
    if (a > 0) {
      if (env.attackCurve === "exp") g.exponentialRampToValueAtTime(Math.max(epsilon, peak), tA);
      else g.linearRampToValueAtTime(peak, tA);
    } else {
      g.setValueAtTime(peak, now);
    }

    const tD = tA + d;
    if (d > 0) {
      if (env.decayCurve === "exp") g.exponentialRampToValueAtTime(sustainLevel, tD);
      else g.linearRampToValueAtTime(sustainLevel, tD);
    } else {
      g.setValueAtTime(sustainLevel, tA);
    }

    currentNote = event.note;
  }

  function applyEnvelopeNoteOff(
    event: Extract<MidiEvent, { type: "noteOff" }>,
    state: EnvelopeRuntimeState,
  ) {
    if (currentNote != null && currentNote !== event.note) return;
    const now = ctx.currentTime;
    const epsilon = 0.0001;

    const env = state.env;
    const r = Math.max(0, env.releaseMs) / 1000;
    const g = amp.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(epsilon, g.value), now);
    if (r > 0) {
      if (env.releaseCurve === "exp") {
        g.exponentialRampToValueAtTime(epsilon, now + r);
        g.setValueAtTime(0, now + r);
      } else {
        g.linearRampToValueAtTime(0, now + r);
      }
    } else {
      g.setValueAtTime(0, now);
    }
    currentNote = null;
  }

  return {
    type: "envelope",
    updateState: () => {},
    getAudioOutput: (portId) => {
      if (portId === "env_out") return amp;
      return null;
    },
    handleMidi: (event, portId, state) => {
      if (portId && portId !== "midi_in") return;
      if (event.type === "noteOn") applyEnvelopeNoteOn(event, state);
      if (event.type === "noteOff") applyEnvelopeNoteOff(event, state);
    },
    onRemove: () => {
      amp.disconnect();
      source.disconnect();
      try {
        source.stop();
      } catch {
        // ignore
      }
    },
  };
}

export function envelopeAudioFactory(_services: AudioNodeServices): AudioNodeFactory<EnvelopeGraphNode> {
  return {
    type: "envelope",
    create: (ctx, nodeId) => createEnvelopeRuntime(ctx, nodeId),
  };
}

