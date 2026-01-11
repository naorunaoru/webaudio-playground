import type { GraphNode, MidiEvent, NodeId } from "../../graph/types";
import { getSampleManager } from "../../audio/sampleManager";
import type {
  AudioNodeFactory,
  AudioNodeInstance,
} from "../../types/audioRuntime";
import type { AudioNodeServices } from "../../types/nodeModule";

type SamplePlayerGraphNode = Extract<GraphNode, { type: "samplePlayer" }>;
type SamplePlayerRuntimeState = SamplePlayerGraphNode["state"];

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function rmsFromAnalyser(
  analyser: AnalyserNode,
  buffer: Float32Array<ArrayBufferLike>
): number {
  analyser.getFloatTimeDomainData(buffer as any);
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const v = buffer[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / buffer.length);
}

function createSamplePlayerRuntime(
  ctx: AudioContext,
  _nodeId: NodeId
): AudioNodeInstance<SamplePlayerGraphNode> {
  const outGain = ctx.createGain();
  outGain.gain.value = 1;

  const meter = ctx.createAnalyser();
  meter.fftSize = 256;
  meter.smoothingTimeConstant = 0.6;
  const meterBuffer = new Float32Array(
    meter.fftSize
  ) as Float32Array<ArrayBufferLike>;

  outGain.connect(meter);

  const activeByNote = new Map<number, Set<AudioBufferSourceNode>>();
  const activeSources: AudioBufferSourceNode[] = [];
  const MAX_VOICES = 32;

  let currentState: SamplePlayerRuntimeState | null = null;

  let runtimeState: {
    sampleId: string | null;
    error: string | null;
    voices: number;
  } = {
    sampleId: null,
    error: null,
    voices: 0,
  };

  function setRuntimeError(error: string | null) {
    if (
      error !== runtimeState.error ||
      currentState?.sampleId !== runtimeState.sampleId
    ) {
      runtimeState = {
        sampleId: currentState?.sampleId ?? null,
        error,
        voices: runtimeState.voices,
      };
    }
  }

  function safeStop(src: AudioBufferSourceNode) {
    try {
      src.stop();
    } catch {
      // ignore
    }
  }

  function cleanupSource(src: AudioBufferSourceNode, note: number | null) {
    const idx = activeSources.indexOf(src);
    if (idx >= 0) activeSources.splice(idx, 1);
    if (note != null) {
      const set = activeByNote.get(note);
      set?.delete(src);
      if (set && set.size === 0) activeByNote.delete(note);
    }
  }

  function registerSource(src: AudioBufferSourceNode, note: number | null) {
    activeSources.push(src);
    if (activeSources.length > MAX_VOICES) safeStop(activeSources.shift()!);
    if (note != null) {
      const set = activeByNote.get(note) ?? new Set<AudioBufferSourceNode>();
      set.add(src);
      activeByNote.set(note, set);
    }
    src.onended = () => cleanupSource(src, note);
  }

  function prefetch(state: SamplePlayerRuntimeState) {
    if (!state.sampleId) return;
    getSampleManager(ctx)
      .getBuffer(state.sampleId)
      .then(() => {
        setRuntimeError(null);
      })
      .catch((e) => {
        setRuntimeError(e instanceof Error ? e.message : String(e));
      });
  }

  function onNoteOn(
    event: Extract<MidiEvent, { type: "noteOn" }>,
    state: SamplePlayerRuntimeState
  ) {
    const sampleId = state.sampleId;
    if (!sampleId) return;

    const velocity01 = clamp(event.velocity / 127, 0, 1);
    const note = clamp(event.note, 0, 127);
    const pitchRatio = state.followPitch
      ? Math.pow(2, (note - clamp(state.rootNote, 0, 127)) / 12)
      : 1;

    getSampleManager(ctx)
      .getBuffer(sampleId)
      .then((buffer) => {
        setRuntimeError(null);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = pitchRatio;
        src.loop = state.loop;

        const voiceGain = ctx.createGain();
        voiceGain.gain.value = velocity01;

        src.connect(voiceGain);
        voiceGain.connect(outGain);

        registerSource(src, state.stopOnNoteOff ? note : null);
        src.start();
      })
      .catch((e) => {
        setRuntimeError(e instanceof Error ? e.message : String(e));
      });
  }

  function onNoteOff(
    event: Extract<MidiEvent, { type: "noteOff" }>,
    state: SamplePlayerRuntimeState
  ) {
    if (!state.stopOnNoteOff) return;
    const note = clamp(event.note, 0, 127);
    const set = activeByNote.get(note);
    if (!set) return;
    for (const src of set) safeStop(src);
    activeByNote.delete(note);
  }

  return {
    type: "samplePlayer",
    updateState: (state) => {
      currentState = state;
      outGain.gain.value = clamp(state.gain, 0, 2);
      prefetch(state);
    },
    getAudioOutput: (portId) => {
      if (portId === "audio_out") return meter;
      return null;
    },
    handleMidi: (event, portId, state) => {
      if (portId && portId !== "midi_in") return;
      currentState = state;
      if (event.type === "noteOn") onNoteOn(event, state);
      if (event.type === "noteOff") onNoteOff(event, state);
    },
    onRemove: () => {
      for (const src of activeSources) safeStop(src);
      activeSources.splice(0, activeSources.length);
      activeByNote.clear();
      meter.disconnect();
      outGain.disconnect();
    },
    getLevel: () => rmsFromAnalyser(meter, meterBuffer),
    getRuntimeState: () => runtimeState,
  };
}

export function samplePlayerAudioFactory(
  _services: AudioNodeServices
): AudioNodeFactory<SamplePlayerGraphNode> {
  return {
    type: "samplePlayer",
    create: (ctx, nodeId) => createSamplePlayerRuntime(ctx, nodeId),
  };
}
