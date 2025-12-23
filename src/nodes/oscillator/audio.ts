import type { GraphNode, MidiEvent, NodeId } from "../../graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "../../types/audioRuntime";
import type { AudioNodeServices } from "../../types/nodeModule";

type OscillatorGraphNode = Extract<GraphNode, { type: "oscillator" }>;

const A4_HZ = 440;

function midiToFreqHz(note: number, a4Hz: number): number {
  return a4Hz * Math.pow(2, (note - 69) / 12);
}

function rmsFromAnalyser(analyser: AnalyserNode, buffer: Float32Array<ArrayBufferLike>): number {
  analyser.getFloatTimeDomainData(buffer as any);
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const v = buffer[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / buffer.length);
}

type OscillatorRuntimeState = OscillatorGraphNode["state"];

function createOscillatorRuntime(ctx: AudioContext, _nodeId: NodeId): AudioNodeInstance<OscillatorGraphNode> {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  amp.gain.value = 0;

  const meter = ctx.createAnalyser();
  meter.fftSize = 256;
  meter.smoothingTimeConstant = 0.6;
  const meterBuffer = new Float32Array(meter.fftSize) as Float32Array<ArrayBufferLike>;

  osc.connect(amp);
  amp.connect(meter);
  osc.start();

  let currentNote: number | null = null;

  function applyEnvelopeNoteOn(
    event: Extract<MidiEvent, { type: "noteOn" }>,
    state: OscillatorRuntimeState,
  ) {
    const now = ctx.currentTime;
    const epsilon = 0.0001;

    const hz = midiToFreqHz(event.note, A4_HZ);
    osc.detune.setValueAtTime(state.detuneCents, now);
    osc.frequency.setValueAtTime(hz, now);

    const peak = Math.min(1, Math.max(0, event.velocity / 127)) * 0.2;
    const env = state.env;
    const a = Math.max(0, env.attackMs) / 1000;
    const d = Math.max(0, env.decayMs) / 1000;
    const s = Math.max(0, Math.min(1, env.sustain));
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
    state: OscillatorRuntimeState,
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
    type: "oscillator",
    updateState: (state) => {
      osc.type = state.waveform;
    },
    getAudioOutput: (portId) => {
      if (portId === "audio_out") return meter;
      return null;
    },
    handleMidi: (event, portId, state) => {
      if (portId && portId !== "midi_in") return;
      if (event.type === "noteOn") applyEnvelopeNoteOn(event, state);
      if (event.type === "noteOff") applyEnvelopeNoteOff(event, state);
    },
    onRemove: () => {
      meter.disconnect();
      amp.disconnect();
      osc.disconnect();
      try {
        osc.stop();
      } catch {
        // ignore
      }
    },
    getLevel: () => rmsFromAnalyser(meter, meterBuffer),
  };
}

export function oscillatorAudioFactory(_services: AudioNodeServices): AudioNodeFactory<OscillatorGraphNode> {
  return {
    type: "oscillator",
    create: (ctx, nodeId) => createOscillatorRuntime(ctx, nodeId),
  };
}
