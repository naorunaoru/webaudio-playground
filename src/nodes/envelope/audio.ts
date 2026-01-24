import type { GraphNode, NodeId, VoiceEvent } from "@graph/types";
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
import envelopeProcessorUrl from "./processor.ts?worklet";

type EnvelopeGraphNode = Extract<GraphNode, { type: "envelope" }>;
type EnvelopeNodeState = EnvelopeGraphNode["state"];

const MAX_VOICES = 8;

export type EnvelopeRuntimeState = {
  currentLevel: number;
  phase: EnvelopePhase;
  phaseProgress: number;
  activeNotes: number[];
};

type VoiceState = {
  gateOn: boolean;
  noteOnAtSec: number | null;
  noteOnStartLevel: number;
  noteOnPeak: number;
  noteOnSustainLevel: number;
  releaseStartAtSec: number | null;
  releaseStartLevel: number;
  releaseDurationSec: number;
};

function createVoiceState(): VoiceState {
  return {
    gateOn: false,
    noteOnAtSec: null,
    noteOnStartLevel: 0,
    noteOnPeak: 0,
    noteOnSustainLevel: 0,
    releaseStartAtSec: null,
    releaseStartLevel: 0,
    releaseDurationSec: 0,
  };
}

const workletModuleLoadByContext = new WeakMap<AudioContext, Promise<void>>();

function ensureEnvelopeWorkletModuleLoaded(ctx: AudioContext): Promise<void> {
  const existing = workletModuleLoadByContext.get(ctx);
  if (existing) return existing;
  const p = ctx.audioWorklet.addModule(envelopeProcessorUrl);
  workletModuleLoadByContext.set(ctx, p);
  return p;
}

function createEnvelopeRuntime(
  ctx: AudioContext,
  _nodeId: NodeId
): AudioNodeInstance<EnvelopeGraphNode> {
  // Voice states for UI visualization
  const voiceStates: VoiceState[] = [];
  for (let i = 0; i < MAX_VOICES; i++) {
    voiceStates.push(createVoiceState());
  }

  // ChannelSplitter to split N-channel worklet output into N mono outputs
  const outputSplitter = ctx.createChannelSplitter(MAX_VOICES);

  // Create N GainNodes as envelope outputs (one per voice channel)
  const envOutputs: GainNode[] = [];
  for (let i = 0; i < MAX_VOICES; i++) {
    const output = ctx.createGain();
    output.gain.value = 1;
    envOutputs.push(output);
  }

  // Connect splitter outputs to individual output gains
  for (let i = 0; i < MAX_VOICES; i++) {
    outputSplitter.connect(envOutputs[i], i);
  }

  let worklet: AudioWorkletNode | null = null;
  let cachedEnv: EnvelopeNodeState["env"] | null = null;

  const createWorklet = async () => {
    if (worklet) return;

    try {
      await ensureEnvelopeWorkletModuleLoaded(ctx);

      worklet = new AudioWorkletNode(ctx, "envelope", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [MAX_VOICES],
        channelCount: MAX_VOICES,
        channelCountMode: "explicit",
        channelInterpretation: "discrete",
      });

      // Send initial params
      if (cachedEnv) {
        worklet.port.postMessage({
          type: "params",
          params: {
            attackMs: cachedEnv.attackMs,
            decayMs: cachedEnv.decayMs,
            sustain: cachedEnv.sustain,
            releaseMs: cachedEnv.releaseMs,
            attackShape: cachedEnv.attackShape,
            decayShape: cachedEnv.decayShape,
            releaseShape: cachedEnv.releaseShape,
            retrigger: cachedEnv.retrigger,
          },
        });
      }

      worklet.connect(outputSplitter);
    } catch (e) {
      console.error("Failed to create envelope worklet:", e);
    }
  };

  const destroyWorklet = () => {
    if (!worklet) return;
    try {
      worklet.disconnect();
    } catch {
      // ignore
    }
    worklet = null;
  };

  // Create worklet immediately
  void createWorklet();

  function levelAtElapsedSec(
    voiceIdx: number,
    elapsedSec: number,
    env: EnvelopeNodeState["env"]
  ): number {
    const voice = voiceStates[voiceIdx];
    const a = Math.max(0, env.attackMs) / 1000;
    const d = Math.max(0, env.decayMs) / 1000;

    if (elapsedSec <= 0) return voice.noteOnStartLevel;
    if (a > 0 && elapsedSec < a) {
      const t = elapsedSec / a;
      return (
        voice.noteOnStartLevel +
        (voice.noteOnPeak - voice.noteOnStartLevel) * shapedT(t, env.attackShape)
      );
    }
    if (d > 0 && elapsedSec < a + d) {
      const t = (elapsedSec - a) / d;
      return (
        voice.noteOnPeak +
        (voice.noteOnSustainLevel - voice.noteOnPeak) * shapedT(t, env.decayShape)
      );
    }
    return voice.noteOnSustainLevel;
  }

  function applyGateOn(voiceIdx: number, env: EnvelopeNodeState["env"]) {
    const now = ctx.currentTime;
    const voice = voiceStates[voiceIdx];

    const peak = 1;
    const s = clamp01(env.sustain);
    const sustainLevel = peak * s;

    voice.noteOnStartLevel = env.retrigger ? 0 : (voice.gateOn ? voice.noteOnSustainLevel : 0);
    voice.gateOn = true;
    voice.noteOnAtSec = now;
    voice.noteOnPeak = peak;
    voice.noteOnSustainLevel = sustainLevel;
    voice.releaseStartAtSec = null;

    // Send gate event to worklet
    worklet?.port.postMessage({ type: "gate", voice: voiceIdx, state: "on" });
  }

  function applyGateOff(voiceIdx: number, env: EnvelopeNodeState["env"]) {
    const now = ctx.currentTime;
    const voice = voiceStates[voiceIdx];

    if (!voice.gateOn) return;

    const r = Math.max(0, env.releaseMs) / 1000;
    const startLevel =
      voice.noteOnAtSec == null
        ? 0
        : Math.max(0, levelAtElapsedSec(voiceIdx, now - voice.noteOnAtSec, env));

    voice.gateOn = false;
    voice.releaseStartAtSec = now;
    voice.releaseStartLevel = startLevel;
    voice.releaseDurationSec = r;
    voice.noteOnAtSec = null;

    // Send gate event to worklet
    worklet?.port.postMessage({ type: "gate", voice: voiceIdx, state: "off" });
  }

  function computeRuntimeState(): EnvelopeRuntimeState {
    // Return state for voice 0 (for UI visualization)
    const now = ctx.currentTime;
    const voice = voiceStates[0];
    const activeVoices = voiceStates.filter((v) => v.gateOn).length;

    if (voice.noteOnAtSec == null && voice.releaseStartAtSec == null) {
      return { currentLevel: 0, phase: "idle", phaseProgress: 0, activeNotes: [] };
    }

    const env = cachedEnv;
    const timing: EnvelopeTiming = {
      attackSec: Math.max(0, env?.attackMs ?? 0) / 1000,
      decaySec: Math.max(0, env?.decayMs ?? 0) / 1000,
      releaseSec: voice.releaseDurationSec,
    };

    if (voice.releaseStartAtSec != null) {
      const elapsed = now - voice.releaseStartAtSec;
      const { phase, progress } = getPhaseAtTime(elapsed, timing, true);

      if (phase === "idle") {
        voice.releaseStartAtSec = null;
        return { currentLevel: 0, phase: "idle", phaseProgress: 0, activeNotes: [] };
      }

      const level = env
        ? voice.releaseStartLevel * (1 - shapedT(progress, env.releaseShape))
        : voice.releaseStartLevel * (1 - progress);

      return {
        currentLevel: Math.max(0, level),
        phase,
        phaseProgress: progress,
        activeNotes: Array(activeVoices).fill(0),
      };
    }

    if (voice.noteOnAtSec != null && env) {
      const elapsed = now - voice.noteOnAtSec;
      const { phase, progress } = getPhaseAtTime(elapsed, timing, false);
      const level =
        phase === "sustain" ? voice.noteOnSustainLevel : levelAtElapsedSec(0, elapsed, env);
      return {
        currentLevel: Math.max(0, level),
        phase,
        phaseProgress: progress,
        activeNotes: Array(activeVoices).fill(0),
      };
    }

    return { currentLevel: 0, phase: "idle", phaseProgress: 0, activeNotes: [] };
  }

  return {
    type: "envelope",
    updateState: (state) => {
      cachedEnv = state.env;
      worklet?.port.postMessage({
        type: "params",
        params: {
          attackMs: state.env.attackMs,
          decayMs: state.env.decayMs,
          sustain: state.env.sustain,
          releaseMs: state.env.releaseMs,
          attackShape: state.env.attackShape,
          decayShape: state.env.decayShape,
          releaseShape: state.env.releaseShape,
          retrigger: state.env.retrigger,
        },
      });
    },
    getAudioOutputs: (portId) => {
      if (portId === "env_out") return envOutputs;
      return [];
    },
    handleEvent: (portId, event: VoiceEvent) => {
      if (portId !== "gate_in") return;
      if (event.type !== "gate") return;
      if (!cachedEnv) return;

      const voiceIdx = event.voice;
      if (voiceIdx < 0 || voiceIdx >= MAX_VOICES) return;

      if (event.state === "on") {
        applyGateOn(voiceIdx, cachedEnv);
      } else {
        applyGateOff(voiceIdx, cachedEnv);
      }
    },
    onRemove: () => {
      destroyWorklet();
      try {
        outputSplitter.disconnect();
        for (const output of envOutputs) {
          output.disconnect();
        }
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
