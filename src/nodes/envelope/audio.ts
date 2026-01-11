import type { GraphNode, MidiEvent, NodeId } from "@graph/types";
import type {
  AudioNodeFactory,
  AudioNodeInstance,
} from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";
import {
  shapedT,
  getPhaseAtTime,
  type EnvelopePhase,
  type EnvelopeTiming,
} from "@utils/envelope";
import { clamp01 } from "@utils/math";

type EnvelopeGraphNode = Extract<GraphNode, { type: "envelope" }>;
type EnvelopeNodeState = EnvelopeGraphNode["state"];

export type EnvelopeRuntimeState = {
  currentLevel: number;
  phase: EnvelopePhase;
  phaseProgress: number; // 0-1, how far through current phase
  activeNotes: number[];
};

function makeCurve(
  start: number,
  end: number,
  shape: number,
  points = 128
): Float32Array {
  const n = Math.max(2, Math.floor(points));
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const u = shapedT(t, shape);
    curve[i] = start + (end - start) * u;
  }
  return curve;
}

function createEnvelopeRuntime(
  ctx: AudioContext,
  _nodeId: NodeId
): AudioNodeInstance<EnvelopeGraphNode> {
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

  // For tracking release phase
  let releaseStartAtSec: number | null = null;
  let releaseStartLevel = 0;
  let releaseDurationSec = 0;

  // Current envelope parameters (cached for getRuntimeState)
  let cachedEnv: EnvelopeNodeState["env"] | null = null;

  const activeNotes = new Set<number>();

  function levelAtElapsedSec(
    elapsedSec: number,
    env: EnvelopeNodeState["env"]
  ): number {
    const a = Math.max(0, env.attackMs) / 1000;
    const d = Math.max(0, env.decayMs) / 1000;

    if (elapsedSec <= 0) return noteOnStartLevel;
    if (a > 0 && elapsedSec < a) {
      const t = elapsedSec / a;
      return (
        noteOnStartLevel +
        (noteOnPeak - noteOnStartLevel) * shapedT(t, env.attackShape)
      );
    }
    if (d > 0 && elapsedSec < a + d) {
      const t = (elapsedSec - a) / d;
      return (
        noteOnPeak +
        (noteOnSustainLevel - noteOnPeak) * shapedT(t, env.decayShape)
      );
    }
    return noteOnSustainLevel;
  }

  function applyEnvelopeNoteOn(
    event: Extract<MidiEvent, { type: "noteOn" }>,
    state: EnvelopeNodeState
  ) {
    const now = ctx.currentTime;

    const peak = clamp01(event.velocity / 127);
    const env = state.env;
    cachedEnv = env;
    const a = Math.max(0, env.attackMs) / 1000;
    const d = Math.max(0, env.decayMs) / 1000;
    const s = clamp01(env.sustain);
    const sustainLevel = peak * s;

    const g = amp.gain;
    g.cancelScheduledValues(now);
    noteOnStartLevel = env.retrigger ? 0 : Math.max(0, g.value);
    g.setValueAtTime(noteOnStartLevel, now);

    noteOnAtSec = now;
    noteOnPeak = peak;
    noteOnSustainLevel = sustainLevel;
    releaseStartAtSec = null; // Clear release state

    if (a > 0) {
      g.setValueCurveAtTime(
        makeCurve(noteOnStartLevel, peak, env.attackShape),
        now,
        a
      );
    } else {
      g.setValueAtTime(peak, now);
    }

    const tA = now + a;
    if (d > 0) {
      g.setValueCurveAtTime(
        makeCurve(peak, sustainLevel, env.decayShape),
        tA,
        d
      );
    } else {
      g.setValueAtTime(sustainLevel, tA);
    }

    currentNote = event.note;
  }

  function applyEnvelopeNoteOff(
    event: Extract<MidiEvent, { type: "noteOff" }>,
    state: EnvelopeNodeState
  ) {
    if (currentNote != null && currentNote !== event.note) return;
    const now = ctx.currentTime;

    const env = state.env;
    cachedEnv = env;
    const r = Math.max(0, env.releaseMs) / 1000;
    const g = amp.gain;
    const startLevel =
      noteOnAtSec == null
        ? Math.max(0, g.value)
        : Math.max(0, levelAtElapsedSec(now - noteOnAtSec, env));

    g.cancelScheduledValues(now);
    g.setValueAtTime(startLevel, now);

    // Track release phase
    releaseStartAtSec = now;
    releaseStartLevel = startLevel;
    releaseDurationSec = r;

    if (r > 0)
      g.setValueCurveAtTime(makeCurve(startLevel, 0, env.releaseShape), now, r);
    else g.setValueAtTime(0, now);

    currentNote = null;
    noteOnAtSec = null;
  }

  function computeRuntimeState(): EnvelopeRuntimeState {
    const now = ctx.currentTime;
    const notesArr = Array.from(activeNotes);

    // Idle state
    if (noteOnAtSec == null && releaseStartAtSec == null) {
      return { currentLevel: 0, phase: "idle", phaseProgress: 0, activeNotes: notesArr };
    }

    const env = cachedEnv;
    const timing: EnvelopeTiming = {
      attackSec: Math.max(0, env?.attackMs ?? 0) / 1000,
      decaySec: Math.max(0, env?.decayMs ?? 0) / 1000,
      releaseSec: releaseDurationSec,
    };

    // Release phase
    if (releaseStartAtSec != null) {
      const elapsed = now - releaseStartAtSec;
      const { phase, progress } = getPhaseAtTime(elapsed, timing, true);

      if (phase === "idle") {
        releaseStartAtSec = null;
        return { currentLevel: 0, phase: "idle", phaseProgress: 0, activeNotes: notesArr };
      }

      const level = env
        ? releaseStartLevel * (1 - shapedT(progress, env.releaseShape))
        : releaseStartLevel * (1 - progress);

      return { currentLevel: Math.max(0, level), phase, phaseProgress: progress, activeNotes: notesArr };
    }

    // Attack/Decay/Sustain phases
    if (noteOnAtSec != null && env) {
      const elapsed = now - noteOnAtSec;
      const { phase, progress } = getPhaseAtTime(elapsed, timing, false);

      const level = phase === "sustain" ? noteOnSustainLevel : levelAtElapsedSec(elapsed, env);

      return { currentLevel: Math.max(0, level), phase, phaseProgress: progress, activeNotes: notesArr };
    }

    // Fallback
    return { currentLevel: 0, phase: "idle", phaseProgress: 0, activeNotes: notesArr };
  }

  return {
    type: "envelope",
    updateState: (state) => {
      cachedEnv = state.env;
    },
    getAudioOutput: (portId) => {
      if (portId === "env_out") return amp;
      return null;
    },
    handleMidi: (event, portId, state) => {
      if (portId && portId !== "midi_in") return;
      if (event.type === "noteOn") {
        activeNotes.add(event.note);
        applyEnvelopeNoteOn(event, state);
      }
      if (event.type === "noteOff") {
        activeNotes.delete(event.note);
        applyEnvelopeNoteOff(event, state);
      }
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
    getRuntimeState: computeRuntimeState,
  };
}

export function envelopeAudioFactory(
  _services: AudioNodeServices
): AudioNodeFactory<EnvelopeGraphNode> {
  return {
    type: "envelope",
    create: (ctx, nodeId) => createEnvelopeRuntime(ctx, nodeId),
  };
}
