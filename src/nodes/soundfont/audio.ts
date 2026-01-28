import type { GraphNode, MidiEvent, NodeId } from "@graph/types";
import type {
  AudioNodeFactory,
  AudioNodeInstance,
} from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";
import { getSoundfontManager } from "@audio/soundfontManager";
import { rmsFromAnalyser } from "@utils/audio";
import { clamp } from "@utils/math";
import { AudioWorkletNodeSynthesizer } from "js-synthesizer";

type SoundfontGraphNode = Extract<GraphNode, { type: "soundfont" }>;

export type SoundfontPreset = {
  bank: number;
  program: number;
  name: string;
};

export type SoundfontRuntimeState = {
  soundfontId: string | null;
  presets: SoundfontPreset[];
  error: string | null;
  status: "loading" | "ready" | "error";
};

const LIB_FLUIDSYNTH_URL = "/js-synth/libfluidsynth-2.4.6.js";
const JS_SYNTH_WORKLET_URL = "/js-synth/js-synthesizer.worklet.min.js";

const workletModuleLoadByContext = new WeakMap<AudioContext, Promise<void>>();

async function ensureSynthWorkletLoaded(ctx: AudioContext): Promise<void> {
  const existing = workletModuleLoadByContext.get(ctx);
  if (existing) return existing;

  const p = (async () => {
    await ctx.audioWorklet.addModule(LIB_FLUIDSYNTH_URL);
    await ctx.audioWorklet.addModule(JS_SYNTH_WORKLET_URL);
  })();

  workletModuleLoadByContext.set(ctx, p);
  return p;
}

function createSoundfontRuntime(
  ctx: AudioContext,
  _nodeId: NodeId
): AudioNodeInstance<SoundfontGraphNode> {
  const outputGain = ctx.createGain();
  outputGain.gain.value = 1;

  const meter = ctx.createAnalyser();
  meter.fftSize = 256;
  meter.smoothingTimeConstant = 0.6;
  const meterBuffer = new Float32Array(meter.fftSize);
  outputGain.connect(meter);

  let synth: AudioWorkletNodeSynthesizer | null = null;
  let synthNode: AudioWorkletNode | null = null;
  let currentSfontId: number | null = null;
  let currentState: SoundfontGraphNode["state"] | null = null;
  let loadedSoundfontId: string | null = null;
  let disposed = false;
  let initPromise: Promise<void> | null = null;

  const runtimeState: SoundfontRuntimeState = {
    soundfontId: null,
    presets: [],
    error: null,
    status: "loading",
  };

  async function initSynth(): Promise<void> {
    if (disposed || synth) return;

    try {
      await ensureSynthWorkletLoaded(ctx);

      synth = new AudioWorkletNodeSynthesizer();
      synth.init(ctx.sampleRate);
      synthNode = synth.createAudioNode(ctx);
      synthNode.connect(outputGain);

      console.log("[Soundfont] Synth initialized successfully");
      runtimeState.status = "ready";
      runtimeState.error = null;
    } catch (e) {
      runtimeState.status = "error";
      runtimeState.error = e instanceof Error ? e.message : String(e);
      console.error("Failed to initialize soundfont synth:", e);
    }
  }

  // Ensure synth is initialized before proceeding
  async function ensureSynthReady(): Promise<boolean> {
    if (synth) return true;
    if (!initPromise) {
      initPromise = initSynth();
    }
    await initPromise;
    return !!synth;
  }

  async function loadSoundfont(soundfontId: string): Promise<void> {
    if (disposed || soundfontId === loadedSoundfontId) return;

    // Wait for synth to be ready
    const ready = await ensureSynthReady();
    if (!ready || !synth || disposed) return;

    try {
      runtimeState.status = "loading";
      runtimeState.error = null;

      const buffer = await getSoundfontManager().getBuffer(soundfontId);

      if (disposed) return;

      // Unload previous soundfont
      if (currentSfontId !== null) {
        try {
          await synth.unloadSFontAsync(currentSfontId);
        } catch {
          // Ignore unload errors
        }
      }

      currentSfontId = await synth.loadSFont(buffer);
      loadedSoundfontId = soundfontId;
      runtimeState.soundfontId = soundfontId;
      console.log("[Soundfont] Loaded SF2, sfontId:", currentSfontId);

      // Query presets from the soundfont
      const sfont = await synth.getSFontObject(currentSfontId);
      const presetIterable = await sfont.getPresetIterable();
      const presets: SoundfontPreset[] = [];
      for (const preset of presetIterable) {
        presets.push({
          bank: preset.bankNum,
          program: preset.num,
          name: preset.name,
        });
      }
      // Sort by bank, then program
      presets.sort((a, b) => a.bank - b.bank || a.program - b.program);
      runtimeState.presets = presets;

      // Apply current program selection to all channels (for manual preset override)
      if (currentState && (currentState.bank !== 0 || currentState.program !== 0)) {
        for (let ch = 0; ch < 16; ch++) {
          synth.midiProgramSelect(ch, currentSfontId, currentState.bank, currentState.program);
        }
      }

      runtimeState.status = "ready";
      runtimeState.error = null;
    } catch (e) {
      runtimeState.status = "error";
      runtimeState.error = e instanceof Error ? e.message : String(e);
      console.error("Failed to load soundfont:", e);
    }
  }

  function handleMidiEvent(event: MidiEvent, state: SoundfontGraphNode["state"]): void {
    if (!synth || currentSfontId === null) {
      console.log("[Soundfont] handleMidiEvent skipped - synth:", !!synth, "sfontId:", currentSfontId);
      return;
    }

    // Channel filtering: state.channel 0 = all, 1-16 = specific channel
    const targetChannel = state.channel;
    if (targetChannel !== 0 && event.channel !== targetChannel - 1) return;

    // Preserve original MIDI channel (0-15) for multi-timbral playback
    const synthChannel = event.channel;
    const sfontId = currentSfontId; // Capture for use in switch

    switch (event.type) {
      case "noteOn":
        synth.midiNoteOn(synthChannel, event.note, event.velocity);
        break;
      case "noteOff":
        synth.midiNoteOff(synthChannel, event.note);
        break;
      case "cc":
        synth.midiControl(synthChannel, event.controller, event.value);
        break;
      case "pitchBend": {
        // MIDI pitch bend is -8192..8191, FluidSynth expects 0..16383
        const fluidPitchBend = event.value + 8192;
        console.log("[Soundfont] pitchBend ch:", synthChannel, "value:", event.value, "->", fluidPitchBend);
        synth.midiPitchBend(synthChannel, fluidPitchBend);
        break;
      }
      case "aftertouch":
        synth.midiChannelPressure(synthChannel, event.value);
        break;
      case "polyAftertouch":
        synth.midiKeyPressure(synthChannel, event.note, event.value);
        break;
      case "programChange": {
        // Channel 9 (0-indexed) is the GM drum channel, uses bank 128
        const bank = synthChannel === 9 ? 128 : 0;
        try {
          synth.midiProgramSelect(synthChannel, sfontId, bank, event.program);
        } catch {
          // Ignore errors from invalid program numbers
        }
        break;
      }
    }
  }

  // Start initialization eagerly (but don't block)
  initPromise = initSynth();

  return {
    type: "soundfont",

    updateState: (state) => {
      const soundfontChanged = state.soundfontId !== currentState?.soundfontId;
      const programChanged =
        state.bank !== currentState?.bank ||
        state.program !== currentState?.program;
      currentState = state;

      outputGain.gain.value = clamp(state.gain, 0, 2);

      if (state.soundfontId && soundfontChanged) {
        void loadSoundfont(state.soundfontId);
      }

      if (!state.soundfontId && loadedSoundfontId) {
        // Soundfont was cleared
        if (synth && currentSfontId !== null) {
          synth.midiAllNotesOff();
          void synth.unloadSFontAsync(currentSfontId).catch(() => {});
          currentSfontId = null;
          loadedSoundfontId = null;
          runtimeState.soundfontId = null;
          runtimeState.presets = [];
        }
      }

      if (programChanged && synth && currentSfontId !== null) {
        // Apply manual preset selection to all channels
        for (let ch = 0; ch < 16; ch++) {
          synth.midiProgramSelect(ch, currentSfontId, state.bank, state.program);
        }
      }
    },

    getAudioOutputs: (portId) => {
      if (portId === "audio_out") return [meter];
      return [];
    },

    handleMidi: (event, portId, state) => {
      if (portId && portId !== "midi_in") return;
      currentState = state;
      handleMidiEvent(event, state);
    },

    onRemove: () => {
      disposed = true;
      try {
        synth?.midiAllNotesOff();
        synth?.midiAllSoundsOff();
        synthNode?.disconnect();
        outputGain.disconnect();
        meter.disconnect();
        if (synth && currentSfontId !== null) {
          synth.unloadSFont(currentSfontId);
        }
        synth?.close();
      } catch {
        // Ignore cleanup errors
      }
      synth = null;
      synthNode = null;
    },

    getLevel: () => rmsFromAnalyser(meter, meterBuffer),

    getRuntimeState: () => runtimeState,
  };
}

export function soundfontAudioFactory(
  _services: AudioNodeServices
): AudioNodeFactory<SoundfontGraphNode> {
  return {
    type: "soundfont",
    create: (ctx, nodeId) => createSoundfontRuntime(ctx, nodeId),
  };
}
