import type { GraphNode, MidiEvent, NodeId } from "../../graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "../../types/audioRuntime";
import type { AudioNodeServices } from "../../types/nodeModule";

type EnvelopeGraphNode = Extract<GraphNode, { type: "envelope" }>;
type EnvelopeRuntimeState = EnvelopeGraphNode["state"];

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function clampShape(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-1, Math.min(1, v));
}

function gammaForShape(shape: number): number {
  return Math.pow(2, clampShape(shape) * 4);
}

function shapedT(t: number, shape: number): number {
  const tt = Math.max(0, Math.min(1, t));
  const g = gammaForShape(shape);
  if (g === 1) return tt;
  return Math.pow(tt, g);
}

function makeCurve(start: number, end: number, shape: number, points = 128): Float32Array {
  const n = Math.max(2, Math.floor(points));
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const u = shapedT(t, shape);
    curve[i] = start + (end - start) * u;
  }
  return curve;
}

function createEnvelopeRuntime(ctx: AudioContext, _nodeId: NodeId): AudioNodeInstance<EnvelopeGraphNode> {
  const source = ctx.createConstantSource();
  source.offset.value = 1;

  const amp = ctx.createGain();
  amp.gain.value = 0;

  source.connect(amp);
  source.start();

  let currentNote: number | null = null;
  let noteOnAtSec: number | null = null;
  let noteOnStartLevel = 0;
  let noteOnPeak = 0;
  let noteOnSustainLevel = 0;

  function levelAtElapsedSec(elapsedSec: number, state: EnvelopeRuntimeState): number {
    const env = state.env;
    const a = Math.max(0, env.attackMs) / 1000;
    const d = Math.max(0, env.decayMs) / 1000;

    if (elapsedSec <= 0) return noteOnStartLevel;
    if (a > 0 && elapsedSec < a) {
      const t = elapsedSec / a;
      return noteOnStartLevel + (noteOnPeak - noteOnStartLevel) * shapedT(t, env.attackShape);
    }
    if (d > 0 && elapsedSec < a + d) {
      const t = (elapsedSec - a) / d;
      return noteOnPeak + (noteOnSustainLevel - noteOnPeak) * shapedT(t, env.decayShape);
    }
    return noteOnSustainLevel;
  }

  function applyEnvelopeNoteOn(
    event: Extract<MidiEvent, { type: "noteOn" }>,
    state: EnvelopeRuntimeState,
  ) {
    const now = ctx.currentTime;

    const peak = clamp01(event.velocity / 127);
    const env = state.env;
    const a = Math.max(0, env.attackMs) / 1000;
    const d = Math.max(0, env.decayMs) / 1000;
    const s = clamp01(env.sustain);
    const sustainLevel = peak * s;

    const g = amp.gain;
    g.cancelScheduledValues(now);
    noteOnStartLevel = Math.max(0, g.value);
    g.setValueAtTime(noteOnStartLevel, now);

    noteOnAtSec = now;
    noteOnPeak = peak;
    noteOnSustainLevel = sustainLevel;

    if (a > 0) {
      g.setValueCurveAtTime(makeCurve(noteOnStartLevel, peak, env.attackShape), now, a);
    } else {
      g.setValueAtTime(peak, now);
    }

    const tA = now + a;
    if (d > 0) {
      g.setValueCurveAtTime(makeCurve(peak, sustainLevel, env.decayShape), tA, d);
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

    const env = state.env;
    const r = Math.max(0, env.releaseMs) / 1000;
    const g = amp.gain;
    const startLevel =
      noteOnAtSec == null ? Math.max(0, g.value) : Math.max(0, levelAtElapsedSec(now - noteOnAtSec, state));

    g.cancelScheduledValues(now);
    g.setValueAtTime(startLevel, now);

    if (r > 0) g.setValueCurveAtTime(makeCurve(startLevel, 0, env.releaseShape), now, r);
    else g.setValueAtTime(0, now);

    currentNote = null;
    noteOnAtSec = null;
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
