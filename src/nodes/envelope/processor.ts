/**
 * Envelope AudioWorklet Processor
 *
 * Generates multi-phase envelope with custom curve shapes.
 * Outputs N channels (one per voice) of envelope CV.
 *
 * Gate events are sent via MessagePort, envelope is computed sample-by-sample.
 */

import { clamp01 } from "@utils/math";
import { shapedT } from "@utils/envelope";

type EnvelopePhase = {
  id: string;
  targetLevel: number;
  durationMs: number;
  shape: number;
  hold: boolean;
};

type EnvelopeParams = {
  phases: EnvelopePhase[];
  retrigger: boolean;
};

type VoiceState = {
  phaseIndex: number;          // Current phase (0 to N-1), or -1 for idle
  level: number;               // Current output level
  phaseStartSample: number;    // Sample when current phase started
  phaseDurationSamples: number;
  startLevel: number;          // Level at start of current phase
  targetLevel: number;         // Level at end of current phase
  shape: number;
  isHolding: boolean;          // True if waiting for gate-off at a hold phase
  isForceRelease: boolean;     // True if in force-release fade
};

type EnvelopeMessage =
  | { type: "params"; params: EnvelopeParams }
  | { type: "gate"; voice: number; state: "on" | "off" }
  | { type: "forceRelease"; voice: number }
  | { type: "releaseAll" };

/** Fast fade duration in milliseconds for force release. */
const FORCE_RELEASE_FADE_MS = 5;

function createVoiceState(): VoiceState {
  return {
    phaseIndex: -1,
    level: 0,
    phaseStartSample: 0,
    phaseDurationSamples: 0,
    startLevel: 0,
    targetLevel: 0,
    shape: 0,
    isHolding: false,
    isForceRelease: false,
  };
}

/**
 * Compute the index of the first "release" phase.
 * Release starts at the first phase after the last hold phase.
 * If no phase has hold=true, release starts at the last phase.
 */
function computeReleasePhaseIndex(phases: EnvelopePhase[]): number {
  if (phases.length === 0) return 0;

  // Find the last phase with hold=true (excluding the last phase, since hold is ignored there)
  let lastHoldIndex = -1;
  for (let i = 0; i < phases.length - 1; i++) {
    if (phases[i]!.hold) {
      lastHoldIndex = i;
    }
  }

  // Release starts at the phase after the last hold
  if (lastHoldIndex >= 0) {
    return lastHoldIndex + 1;
  }

  // No hold phases: release starts at the last phase
  return phases.length - 1;
}

class EnvelopeProcessor extends AudioWorkletProcessor {
  private params: EnvelopeParams = {
    phases: [],
    retrigger: false,
  };

  private releasePhaseIndex = 0;
  private voiceCount = 32;
  private voices: VoiceState[];
  private currentSample = 0;

  constructor() {
    super();
    this.voices = [];
    for (let i = 0; i < this.voiceCount; i++) {
      this.voices.push(createVoiceState());
    }

    this.port.onmessage = (event: MessageEvent<EnvelopeMessage>) => {
      const data = event.data;
      if (data.type === "params") {
        this.params = data.params;
        this.releasePhaseIndex = computeReleasePhaseIndex(this.params.phases);
      } else if (data.type === "gate") {
        this.handleGate(data.voice, data.state);
      } else if (data.type === "forceRelease") {
        this.handleForceRelease(data.voice);
      } else if (data.type === "releaseAll") {
        this.handleReleaseAll();
      }
    };
  }

  private startPhase(voice: VoiceState, phaseIndex: number, startLevel: number) {
    const phases = this.params.phases;

    if (phaseIndex < 0 || phaseIndex >= phases.length) {
      // Go idle
      voice.phaseIndex = -1;
      voice.level = 0;
      voice.isHolding = false;
      voice.isForceRelease = false;
      return;
    }

    const phase = phases[phaseIndex]!;
    const durationSamples = Math.max(1, (phase.durationMs / 1000) * sampleRate);

    voice.phaseIndex = phaseIndex;
    voice.phaseStartSample = this.currentSample;
    voice.phaseDurationSamples = durationSamples;
    voice.startLevel = startLevel;
    voice.targetLevel = clamp01(phase.targetLevel);
    voice.shape = phase.shape;
    voice.isHolding = false;
    voice.isForceRelease = false;
  }

  private handleGate(voiceIdx: number, state: "on" | "off") {
    if (voiceIdx < 0 || voiceIdx >= this.voices.length) return;

    const voice = this.voices[voiceIdx]!;
    const phases = this.params.phases;

    if (state === "on") {
      // Gate on - start from phase 0
      if (phases.length === 0) {
        // No phases: go idle
        voice.phaseIndex = -1;
        voice.level = 0;
        return;
      }

      const startLevel = this.params.retrigger ? 0 : voice.level;
      this.startPhase(voice, 0, startLevel);
    } else {
      // Gate off - jump to release phase
      if (voice.phaseIndex < 0) return; // Already idle

      // If we're holding, or before the release portion, jump to release
      if (voice.phaseIndex < this.releasePhaseIndex || voice.isHolding) {
        this.startPhase(voice, this.releasePhaseIndex, voice.level);
      }
      // If already in release portion, let it continue
    }
  }

  private handleForceRelease(voiceIdx: number) {
    if (voiceIdx < 0 || voiceIdx >= this.voices.length) return;

    const voice = this.voices[voiceIdx]!;

    // If already idle, nothing to do
    if (voice.phaseIndex < 0 && !voice.isForceRelease) return;

    // Start fast fade
    const fadeSamples = Math.max(1, (FORCE_RELEASE_FADE_MS / 1000) * sampleRate);

    voice.phaseIndex = -1; // Mark as special force-release state
    voice.isForceRelease = true;
    voice.phaseStartSample = this.currentSample;
    voice.phaseDurationSamples = fadeSamples;
    voice.startLevel = voice.level;
    voice.targetLevel = 0;
    voice.shape = 0; // Linear fade
    voice.isHolding = false;
  }

  private handleReleaseAll() {
    const fadeSamples = Math.max(1, (FORCE_RELEASE_FADE_MS / 1000) * sampleRate);

    for (let i = 0; i < this.voices.length; i++) {
      const voice = this.voices[i]!;
      if (voice.phaseIndex >= 0 || voice.isForceRelease) {
        voice.phaseIndex = -1;
        voice.isForceRelease = true;
        voice.phaseStartSample = this.currentSample;
        voice.phaseDurationSamples = fadeSamples;
        voice.startLevel = voice.level;
        voice.targetLevel = 0;
        voice.shape = 0;
        voice.isHolding = false;
      }
    }
  }

  private advanceVoice(voice: VoiceState, voiceIdx: number): void {
    // Idle voice
    if (voice.phaseIndex < 0 && !voice.isForceRelease) {
      return;
    }

    // Holding at a hold phase
    if (voice.isHolding) {
      return;
    }

    const elapsed = this.currentSample - voice.phaseStartSample;
    const duration = voice.phaseDurationSamples;

    if (elapsed >= duration) {
      // Phase complete
      if (voice.isForceRelease) {
        // Force release complete -> idle
        voice.isForceRelease = false;
        voice.phaseIndex = -1;
        voice.level = 0;
        return;
      }

      const phases = this.params.phases;
      const currentPhase = phases[voice.phaseIndex];
      const isLastPhase = voice.phaseIndex >= phases.length - 1;

      // Check if we should hold (but not on the last phase)
      if (currentPhase?.hold && !isLastPhase) {
        voice.level = voice.targetLevel;
        voice.isHolding = true;
        return;
      }

      // Move to next phase or go idle
      if (isLastPhase) {
        // Envelope complete -> idle
        voice.phaseIndex = -1;
        voice.level = 0;
        this.port.postMessage({ type: "releaseComplete", voice: voiceIdx });
      } else {
        // Advance to next phase
        this.startPhase(voice, voice.phaseIndex + 1, voice.targetLevel);
      }
    } else {
      // Interpolate within phase
      const t = elapsed / duration;
      const shaped = shapedT(t, voice.shape);
      voice.level = voice.startLevel + (voice.targetLevel - voice.startLevel) * shaped;
    }
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>
  ): boolean {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const frames = output[0]?.length ?? 0;
    if (frames === 0) return true;

    const outputChannels = output.length;

    for (let i = 0; i < frames; i++) {
      // Process each voice
      for (let ch = 0; ch < outputChannels && ch < this.voices.length; ch++) {
        const voice = this.voices[ch]!;
        this.advanceVoice(voice, ch);
        const out = output[ch];
        if (out) {
          out[i] = voice.level;
        }
      }
      this.currentSample++;
    }

    return true;
  }
}

registerProcessor("envelope", EnvelopeProcessor);
