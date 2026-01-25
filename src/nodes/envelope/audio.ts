import type { GraphNode, GraphState, NodeId, VoiceEvent } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";
import {
  shapedT,
  getPhaseAtTime,
  type EnvelopePhase,
  type EnvelopeTiming,
} from "@utils/envelope";
import { clamp01 } from "@utils/math";
import { findAllocator, type AllocatorLookupResult } from "@audio/allocatorDiscovery";
import envelopeProcessorUrl from "./processor.ts?worklet";

type EnvelopeGraphNode = Extract<GraphNode, { type: "envelope" }>;
type EnvelopeNodeState = EnvelopeGraphNode["state"];

/** Pre-allocated upper limit for voices. */
const MAX_VOICES = 32;

/** Runtime state for a single voice's envelope. */
export type VoiceRuntimeState = {
  voiceIndex: number;
  currentLevel: number;
  phase: EnvelopePhase;
  phaseProgress: number;
};

export type EnvelopeRuntimeState = {
  /** All active voices (non-idle). */
  voices: VoiceRuntimeState[];
  /** Legacy: state for voice 0 (for backwards compatibility). */
  currentLevel: number;
  phase: EnvelopePhase;
  phaseProgress: number;
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
  nodeId: NodeId,
  getAudioNode: AudioNodeServices["getAudioNode"]
): AudioNodeInstance<EnvelopeGraphNode> {
  // Consumer ID for allocator hold/release
  const consumerId = `${nodeId}:gate_in`;

  // Track which allocator each voice came from (for release routing)
  const voiceToSource = new Map<number, AllocatorLookupResult>();

  // Current graph reference for allocator discovery
  let graphRef: GraphState | null = null;

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

      // Listen for releaseComplete messages from worklet
      worklet.port.onmessage = (event: MessageEvent) => {
        const data = event.data;
        if (data.type === "releaseComplete") {
          handleReleaseComplete(data.voice);
        }
      };

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

  /**
   * Called when worklet reports a voice's release phase is complete.
   * Release the hold on the upstream allocator.
   */
  function handleReleaseComplete(voiceIdx: number) {
    const sourceInfo = voiceToSource.get(voiceIdx);
    if (!sourceInfo) return;

    // Map our voice index to the allocator's voice index
    const upstreamVoice = sourceInfo.mapping.toUpstream(voiceIdx);
    sourceInfo.allocator.release(upstreamVoice, consumerId);

    // Clear the mapping for this voice
    voiceToSource.delete(voiceIdx);
  }

  /**
   * Release all holds - called on disconnect or removal.
   */
  function releaseAllHolds() {
    for (const [voiceIdx, sourceInfo] of voiceToSource) {
      const upstreamVoice = sourceInfo.mapping.toUpstream(voiceIdx);
      sourceInfo.allocator.release(upstreamVoice, consumerId);
    }
    voiceToSource.clear();
  }

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

    voice.noteOnStartLevel = env.retrigger ? 0 : voice.gateOn ? voice.noteOnSustainLevel : 0;
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

  function applyForceRelease(voiceIdx: number) {
    const voice = voiceStates[voiceIdx];

    // Update local state
    voice.gateOn = false;
    voice.releaseStartAtSec = ctx.currentTime;
    voice.releaseStartLevel = 0; // Will fast-fade in worklet
    voice.releaseDurationSec = 0.005; // 5ms fast fade
    voice.noteOnAtSec = null;

    // Send force release to worklet (fast fade)
    worklet?.port.postMessage({ type: "forceRelease", voice: voiceIdx });

    // Don't call allocator.release() here - the allocator already cleared holds
    // when it dispatched the force-release event
    voiceToSource.delete(voiceIdx);
  }

  function computeVoiceRuntimeState(
    voiceIdx: number,
    now: number,
    env: EnvelopeNodeState["env"] | null
  ): VoiceRuntimeState | null {
    const voice = voiceStates[voiceIdx];

    // Skip idle voices
    if (voice.noteOnAtSec == null && voice.releaseStartAtSec == null) {
      return null;
    }

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
        return null;
      }

      const level = env
        ? voice.releaseStartLevel * (1 - shapedT(progress, env.releaseShape))
        : voice.releaseStartLevel * (1 - progress);

      return {
        voiceIndex: voiceIdx,
        currentLevel: Math.max(0, level),
        phase,
        phaseProgress: progress,
      };
    }

    if (voice.noteOnAtSec != null && env) {
      const elapsed = now - voice.noteOnAtSec;
      const { phase, progress } = getPhaseAtTime(elapsed, timing, false);
      const level =
        phase === "sustain" ? voice.noteOnSustainLevel : levelAtElapsedSec(voiceIdx, elapsed, env);
      return {
        voiceIndex: voiceIdx,
        currentLevel: Math.max(0, level),
        phase,
        phaseProgress: progress,
      };
    }

    return null;
  }

  function computeRuntimeState(): EnvelopeRuntimeState {
    const now = ctx.currentTime;
    const env = cachedEnv;

    // Collect all active voice states
    const activeVoices: VoiceRuntimeState[] = [];
    for (let i = 0; i < MAX_VOICES; i++) {
      const voiceState = computeVoiceRuntimeState(i, now, env);
      if (voiceState) {
        activeVoices.push(voiceState);
      }
    }

    // Legacy: return voice 0 state for backwards compatibility
    const voice0 = activeVoices.find((v) => v.voiceIndex === 0) ?? activeVoices[0];
    if (voice0) {
      return {
        voices: activeVoices,
        currentLevel: voice0.currentLevel,
        phase: voice0.phase,
        phaseProgress: voice0.phaseProgress,
      };
    }

    return {
      voices: [],
      currentLevel: 0,
      phase: "idle",
      phaseProgress: 0,
    };
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
    setGraphRef: (graph) => {
      graphRef = graph;
    },
    getAudioOutputs: (portId) => {
      if (portId === "env_out") return envOutputs;
      return [];
    },
    handleEvent: (portId, event: VoiceEvent) => {
      if (portId !== "gate_in") return;
      if (!cachedEnv) return;

      const voiceIdx = event.voice;
      if (voiceIdx < 0 || voiceIdx >= MAX_VOICES) return;

      if (event.type === "gate") {
        if (event.state === "on") {
          // Find upstream allocator and hold the voice
          if (graphRef) {
            const sourceInfo = findAllocator(graphRef, nodeId, "gate_in", getAudioNode);
            if (sourceInfo) {
              const upstreamVoice = sourceInfo.mapping.toUpstream(voiceIdx);
              sourceInfo.allocator.hold(upstreamVoice, consumerId);
              voiceToSource.set(voiceIdx, sourceInfo);
            }
          }
          applyGateOn(voiceIdx, cachedEnv);
        } else {
          applyGateOff(voiceIdx, cachedEnv);
        }
      } else if (event.type === "force-release") {
        applyForceRelease(voiceIdx);
      }
    },
    onConnectionsChanged: ({ inputs }) => {
      // If gate input is disconnected, release all holds
      if (!inputs.has("gate_in") && voiceToSource.size > 0) {
        releaseAllHolds();
        // Send fast-fade to worklet for any active voices
        worklet?.port.postMessage({ type: "releaseAll" });
        // Reset voice states
        for (const voice of voiceStates) {
          if (voice.gateOn || voice.releaseStartAtSec !== null) {
            voice.gateOn = false;
            voice.releaseStartAtSec = ctx.currentTime;
            voice.releaseStartLevel = 0;
            voice.releaseDurationSec = 0.005;
            voice.noteOnAtSec = null;
          }
        }
      }
    },
    onRemove: () => {
      // Release all holds before destruction
      releaseAllHolds();
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
  services: AudioNodeServices
): AudioNodeFactory<EnvelopeGraphNode> {
  return {
    type: "envelope",
    create: (ctx, nodeId) => createEnvelopeRuntime(ctx, nodeId, services.getAudioNode),
  };
}
