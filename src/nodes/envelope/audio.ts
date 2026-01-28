import type { GraphNode, GraphState, NodeId, VoiceEvent } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";
import type { EnvelopePhase } from "./types";
import { shapedT } from "@utils/envelope";
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
  phaseIndex: number;      // -1 = idle
  phaseProgress: number;   // 0-1 within current phase
  currentLevel: number;
};

export type EnvelopeRuntimeState = {
  voices: VoiceRuntimeState[];
};

type VoiceState = {
  gateOn: boolean;
  phaseIndex: number;           // Current phase index, -1 = idle
  phaseStartAtSec: number | null;
  phaseDurationSec: number;
  phaseStartLevel: number;
  phaseTargetLevel: number;
  phaseShape: number;
  isHolding: boolean;
};

function createVoiceState(): VoiceState {
  return {
    gateOn: false,
    phaseIndex: -1,
    phaseStartAtSec: null,
    phaseDurationSec: 0,
    phaseStartLevel: 0,
    phaseTargetLevel: 0,
    phaseShape: 0,
    isHolding: false,
  };
}

/**
 * Compute the index of the first "release" phase.
 */
function computeReleasePhaseIndex(phases: EnvelopePhase[]): number {
  if (phases.length === 0) return 0;

  let lastHoldIndex = -1;
  for (let i = 0; i < phases.length - 1; i++) {
    if (phases[i]!.hold) {
      lastHoldIndex = i;
    }
  }

  if (lastHoldIndex >= 0) {
    return lastHoldIndex + 1;
  }

  return phases.length - 1;
}

/**
 * Find the loop start index for a given hold phase.
 * Searches backwards from holdIndex to find the nearest phase with loopStart=true.
 * Returns -1 if no loop start is found.
 */
function findLoopStartIndex(phases: EnvelopePhase[], holdIndex: number): number {
  for (let i = holdIndex; i >= 0; i--) {
    if (phases[i]?.loopStart) {
      return i;
    }
  }
  return -1;
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

  // Cached state
  let cachedPhases: EnvelopePhase[] = [];
  let cachedRetrigger = false;
  let releasePhaseIndex = 0;

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
    outputSplitter.connect(envOutputs[i]!, i);
  }

  let worklet: AudioWorkletNode | null = null;
  let workletReady = false;

  // Queue for events that arrive before worklet is ready
  type PendingEvent = { portId: string; event: VoiceEvent };
  const pendingEvents: PendingEvent[] = [];

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
      if (cachedPhases.length > 0) {
        worklet.port.postMessage({
          type: "params",
          params: {
            phases: cachedPhases,
            retrigger: cachedRetrigger,
          },
        });
      }

      worklet.connect(outputSplitter);

      // Mark worklet as ready and flush pending events
      workletReady = true;
      for (const pending of pendingEvents) {
        processEvent(pending.portId, pending.event);
      }
      pendingEvents.length = 0;
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

  function startPhaseForVoice(voiceIdx: number, phaseIndex: number, startLevel: number) {
    const voice = voiceStates[voiceIdx]!;
    const phases = cachedPhases;

    if (phaseIndex < 0 || phaseIndex >= phases.length) {
      voice.phaseIndex = -1;
      voice.phaseStartAtSec = null;
      voice.isHolding = false;
      return;
    }

    const phase = phases[phaseIndex]!;
    voice.phaseIndex = phaseIndex;
    voice.phaseStartAtSec = ctx.currentTime;
    voice.phaseDurationSec = Math.max(0.001, phase.durationMs / 1000);
    voice.phaseStartLevel = startLevel;
    voice.phaseTargetLevel = clamp01(phase.targetLevel);
    voice.phaseShape = phase.shape;
    voice.isHolding = false;
  }

  function applyGateOn(voiceIdx: number) {
    const voice = voiceStates[voiceIdx]!;
    const phases = cachedPhases;

    if (phases.length === 0) {
      voice.phaseIndex = -1;
      voice.gateOn = false;
      return;
    }

    const startLevel = cachedRetrigger ? 0 : computeCurrentLevel(voiceIdx);
    voice.gateOn = true;
    startPhaseForVoice(voiceIdx, 0, startLevel);

    // Send gate event to worklet
    worklet?.port.postMessage({ type: "gate", voice: voiceIdx, state: "on" });
  }

  function applyGateOff(voiceIdx: number) {
    const voice = voiceStates[voiceIdx]!;

    if (!voice.gateOn && voice.phaseIndex < 0) return;

    voice.gateOn = false;

    // Jump to release phase if we're before it or holding
    if (voice.phaseIndex < releasePhaseIndex || voice.isHolding) {
      const currentLevel = computeCurrentLevel(voiceIdx);
      startPhaseForVoice(voiceIdx, releasePhaseIndex, currentLevel);
    }

    // Send gate event to worklet
    worklet?.port.postMessage({ type: "gate", voice: voiceIdx, state: "off" });
  }

  function applyForceRelease(voiceIdx: number) {
    const voice = voiceStates[voiceIdx]!;

    // Update local state
    voice.gateOn = false;
    voice.phaseIndex = -1;
    voice.phaseStartAtSec = ctx.currentTime;
    voice.phaseDurationSec = 0.005; // 5ms fast fade
    voice.phaseStartLevel = computeCurrentLevel(voiceIdx);
    voice.phaseTargetLevel = 0;
    voice.phaseShape = 0;
    voice.isHolding = false;

    // Send force release to worklet (fast fade)
    worklet?.port.postMessage({ type: "forceRelease", voice: voiceIdx });

    // Don't call allocator.release() here - the allocator already cleared holds
    voiceToSource.delete(voiceIdx);
  }

  function computeCurrentLevel(voiceIdx: number): number {
    const voice = voiceStates[voiceIdx]!;
    const now = ctx.currentTime;

    if (voice.phaseIndex < 0 && voice.phaseStartAtSec == null) {
      return 0;
    }

    if (voice.isHolding) {
      return voice.phaseTargetLevel;
    }

    if (voice.phaseStartAtSec == null) {
      return 0;
    }

    const elapsed = now - voice.phaseStartAtSec;
    const duration = voice.phaseDurationSec;

    if (elapsed >= duration) {
      return voice.phaseTargetLevel;
    }

    const t = clamp01(elapsed / duration);
    const shaped = shapedT(t, voice.phaseShape);
    return voice.phaseStartLevel + (voice.phaseTargetLevel - voice.phaseStartLevel) * shaped;
  }

  function computeVoiceRuntimeState(voiceIdx: number): VoiceRuntimeState | null {
    const voice = voiceStates[voiceIdx]!;
    const now = ctx.currentTime;

    // Idle voice
    if (voice.phaseIndex < 0 && voice.phaseStartAtSec == null) {
      return null;
    }

    // Force release in progress (phaseIndex = -1 but still fading)
    if (voice.phaseIndex < 0 && voice.phaseStartAtSec != null) {
      const elapsed = now - voice.phaseStartAtSec;
      if (elapsed >= voice.phaseDurationSec) {
        voice.phaseStartAtSec = null;
        return null;
      }
      const progress = clamp01(elapsed / voice.phaseDurationSec);
      const level = voice.phaseStartLevel * (1 - progress);
      return {
        voiceIndex: voiceIdx,
        phaseIndex: -1,
        phaseProgress: progress,
        currentLevel: Math.max(0, level),
      };
    }

    // Normal phase progression
    const phases = cachedPhases;
    if (voice.phaseIndex >= phases.length) {
      return null;
    }

    if (voice.isHolding) {
      return {
        voiceIndex: voiceIdx,
        phaseIndex: voice.phaseIndex,
        phaseProgress: 1,
        currentLevel: voice.phaseTargetLevel,
      };
    }

    if (voice.phaseStartAtSec == null) {
      return null;
    }

    const elapsed = now - voice.phaseStartAtSec;
    const duration = voice.phaseDurationSec;
    const progress = clamp01(elapsed / duration);
    const level = computeCurrentLevel(voiceIdx);

    // Check if phase is complete and advance (for visualization sync)
    if (elapsed >= duration) {
      const currentPhase = phases[voice.phaseIndex];
      const isLastPhase = voice.phaseIndex >= phases.length - 1;

      if (currentPhase?.hold && !isLastPhase) {
        // Check if there's a loop start to jump back to
        const loopStartIdx = findLoopStartIndex(phases, voice.phaseIndex);
        if (loopStartIdx >= 0) {
          // Loop to the phase AFTER the loopStart marker
          // (loopStart marks the endpoint, so we start from the next phase)
          const loopTargetIdx = loopStartIdx + 1;
          const startLevel = phases[loopStartIdx]!.targetLevel;
          startPhaseForVoice(voiceIdx, loopTargetIdx, startLevel);
          return computeVoiceRuntimeState(voiceIdx);
        }
        // No loop start found - original hold behavior
        voice.isHolding = true;
        return {
          voiceIndex: voiceIdx,
          phaseIndex: voice.phaseIndex,
          phaseProgress: 1,
          currentLevel: voice.phaseTargetLevel,
        };
      }

      if (isLastPhase) {
        // Envelope complete
        voice.phaseIndex = -1;
        voice.phaseStartAtSec = null;
        return null;
      }

      // Advance to next phase
      startPhaseForVoice(voiceIdx, voice.phaseIndex + 1, voice.phaseTargetLevel);
      return computeVoiceRuntimeState(voiceIdx);
    }

    return {
      voiceIndex: voiceIdx,
      phaseIndex: voice.phaseIndex,
      phaseProgress: progress,
      currentLevel: Math.max(0, level),
    };
  }

  function computeRuntimeState(): EnvelopeRuntimeState {
    const activeVoices: VoiceRuntimeState[] = [];
    for (let i = 0; i < MAX_VOICES; i++) {
      const voiceState = computeVoiceRuntimeState(i);
      if (voiceState) {
        activeVoices.push(voiceState);
      }
    }

    return { voices: activeVoices };
  }

  function processEvent(portId: string, event: VoiceEvent) {
    if (portId !== "gate_in") return;
    if (cachedPhases.length === 0) return;

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
        applyGateOn(voiceIdx);
      } else {
        applyGateOff(voiceIdx);
      }
    } else if (event.type === "force-release") {
      applyForceRelease(voiceIdx);
    }
  }

  return {
    type: "envelope",
    updateState: (state) => {
      cachedPhases = state.phases;
      cachedRetrigger = state.retrigger;
      releasePhaseIndex = computeReleasePhaseIndex(cachedPhases);

      worklet?.port.postMessage({
        type: "params",
        params: {
          phases: state.phases,
          retrigger: state.retrigger,
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
      // Queue events until worklet is ready
      if (!workletReady) {
        pendingEvents.push({ portId, event });
        return;
      }
      processEvent(portId, event);
    },
    onConnectionsChanged: ({ inputs }) => {
      // If gate input is disconnected, release all holds
      if (!inputs.has("gate_in") && voiceToSource.size > 0) {
        releaseAllHolds();
        // Send fast-fade to worklet for any active voices
        worklet?.port.postMessage({ type: "releaseAll" });
        // Reset voice states
        for (const voice of voiceStates) {
          if (voice.gateOn || voice.phaseIndex >= 0) {
            voice.gateOn = false;
            voice.phaseIndex = -1;
            voice.phaseStartAtSec = ctx.currentTime;
            voice.phaseDurationSec = 0.005;
            voice.phaseStartLevel = 0;
            voice.phaseTargetLevel = 0;
            voice.isHolding = false;
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
