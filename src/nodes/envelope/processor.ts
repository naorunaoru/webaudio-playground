/**
 * Envelope AudioWorklet Processor
 *
 * Generates ADSR envelope with custom curve shapes.
 * Outputs N channels (one per voice) of envelope CV.
 *
 * Gate events are sent via MessagePort, envelope is computed sample-by-sample.
 */

import { clamp01 } from "@utils/math";
import { shapedT } from "@utils/envelope";

type EnvelopePhase = "idle" | "attack" | "decay" | "sustain" | "release";

type EnvelopeParams = {
  attackMs: number;
  decayMs: number;
  sustain: number;
  releaseMs: number;
  attackShape: number;
  decayShape: number;
  releaseShape: number;
  retrigger: boolean;
};

type VoiceState = {
  phase: EnvelopePhase;
  level: number;
  // Phase timing
  phaseStartSample: number;
  phaseDurationSamples: number;
  // Levels for interpolation
  startLevel: number;
  targetLevel: number;
  // Shape for current phase
  shape: number;
  // For sustain, store the level
  sustainLevel: number;
};

type EnvelopeMessage =
  | { type: "params"; params: EnvelopeParams }
  | { type: "gate"; voice: number; state: "on" | "off" };

function createVoiceState(): VoiceState {
  return {
    phase: "idle",
    level: 0,
    phaseStartSample: 0,
    phaseDurationSamples: 0,
    startLevel: 0,
    targetLevel: 0,
    shape: 0,
    sustainLevel: 0,
  };
}

class EnvelopeProcessor extends AudioWorkletProcessor {
  private params: EnvelopeParams = {
    attackMs: 10,
    decayMs: 100,
    sustain: 0.7,
    releaseMs: 200,
    attackShape: 0,
    decayShape: 0,
    releaseShape: 0,
    retrigger: false,
  };

  private voiceCount = 8;
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
      } else if (data.type === "gate") {
        this.handleGate(data.voice, data.state);
      }
    };
  }

  private handleGate(voiceIdx: number, state: "on" | "off") {
    if (voiceIdx < 0 || voiceIdx >= this.voices.length) return;

    const voice = this.voices[voiceIdx];
    const p = this.params;

    if (state === "on") {
      // Gate on - start attack phase
      const startLevel = p.retrigger ? 0 : voice.level;
      const attackSamples = Math.max(1, (p.attackMs / 1000) * sampleRate);
      const sustainLevel = clamp01(p.sustain);

      voice.phase = "attack";
      voice.phaseStartSample = this.currentSample;
      voice.phaseDurationSamples = attackSamples;
      voice.startLevel = startLevel;
      voice.targetLevel = 1; // Peak
      voice.shape = p.attackShape;
      voice.sustainLevel = sustainLevel;
    } else {
      // Gate off - start release phase
      if (voice.phase === "idle") return;

      const releaseSamples = Math.max(1, (p.releaseMs / 1000) * sampleRate);

      voice.phase = "release";
      voice.phaseStartSample = this.currentSample;
      voice.phaseDurationSamples = releaseSamples;
      voice.startLevel = voice.level;
      voice.targetLevel = 0;
      voice.shape = p.releaseShape;
    }
  }

  private advanceVoice(voice: VoiceState): void {
    if (voice.phase === "idle" || voice.phase === "sustain") {
      return;
    }

    const elapsed = this.currentSample - voice.phaseStartSample;
    const duration = voice.phaseDurationSamples;

    if (elapsed >= duration) {
      // Phase complete, transition to next
      if (voice.phase === "attack") {
        // Attack complete -> decay
        const decaySamples = Math.max(
          1,
          (this.params.decayMs / 1000) * sampleRate
        );
        voice.phase = "decay";
        voice.phaseStartSample = this.currentSample;
        voice.phaseDurationSamples = decaySamples;
        voice.startLevel = voice.targetLevel; // Peak (1.0)
        voice.targetLevel = voice.sustainLevel;
        voice.shape = this.params.decayShape;
        voice.level = voice.startLevel;
      } else if (voice.phase === "decay") {
        // Decay complete -> sustain
        voice.phase = "sustain";
        voice.level = voice.sustainLevel;
      } else if (voice.phase === "release") {
        // Release complete -> idle
        voice.phase = "idle";
        voice.level = 0;
      }
    } else {
      // Interpolate within phase
      const t = elapsed / duration;
      const shaped = shapedT(t, voice.shape);
      voice.level =
        voice.startLevel + (voice.targetLevel - voice.startLevel) * shaped;
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
        const voice = this.voices[ch];
        this.advanceVoice(voice);
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
