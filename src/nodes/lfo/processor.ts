/**
 * LFO (Low Frequency Oscillator) AudioWorklet Processor
 *
 * Outputs LFO CV signal on N channels (polyphonic).
 * Each channel runs an independent LFO with shared parameters.
 * Supports trigger input for phase reset and one-shot mode.
 */

type LfoWaveform = "sine" | "triangle" | "square" | "sawtooth" | "sawtoothDown";

type LfoMessage =
  | {
      type: "params";
      waveform: LfoWaveform;
      frequencyHz: number;
      rangeMin: number;
      rangeMax: number;
      oneShot: boolean;
    }
  | { type: "trigger"; voice: number }
  | { type: "triggerAll" }
  | { type: "resetAll" };

const MAX_VOICES = 32;

class LfoProcessor extends AudioWorkletProcessor {
  private waveform: LfoWaveform = "sine";
  private frequencyHz = 1;
  private rangeMin = -10;
  private rangeMax = 10;
  private oneShot = false;

  // Per-voice state
  private phases: Float64Array;
  private oneShotComplete: Uint8Array;
  private active: Uint8Array;

  constructor() {
    super();

    this.phases = new Float64Array(MAX_VOICES);
    this.oneShotComplete = new Uint8Array(MAX_VOICES);
    this.active = new Uint8Array(MAX_VOICES);

    // All voices start active
    this.active.fill(1);

    this.port.onmessage = (event: MessageEvent<LfoMessage>) => {
      const data = event.data;

      if (data.type === "params") {
        this.waveform = data.waveform;
        this.frequencyHz = data.frequencyHz;
        this.rangeMin = data.rangeMin;
        this.rangeMax = data.rangeMax;

        // Handle one-shot mode change
        const wasOneShot = this.oneShot;
        this.oneShot = data.oneShot;

        // If switching from one-shot to continuous, reactivate completed voices
        if (wasOneShot && !this.oneShot) {
          this.oneShotComplete.fill(0);
        }
      } else if (data.type === "trigger") {
        // Reset specific voice
        const voice = data.voice;
        if (voice >= 0 && voice < MAX_VOICES) {
          this.phases[voice] = 0;
          this.oneShotComplete[voice] = 0;
        }
      } else if (data.type === "triggerAll") {
        // Reset all voices
        this.phases.fill(0);
        this.oneShotComplete.fill(0);
      } else if (data.type === "resetAll") {
        // Full reset
        this.phases.fill(0);
        this.oneShotComplete.fill(0);
        this.active.fill(1);
      }
    };
  }

  /**
   * Generate waveform value at given phase.
   * Phase is 0-1 (one complete cycle).
   * Output is -1 to 1.
   */
  private generateWaveform(phase: number): number {
    switch (this.waveform) {
      case "sine":
        return Math.sin(phase * 2 * Math.PI);

      case "triangle":
        // 0->0.25: 0->1, 0.25->0.75: 1->-1, 0.75->1: -1->0
        if (phase < 0.25) return phase * 4;
        if (phase < 0.75) return 2 - phase * 4;
        return phase * 4 - 4;

      case "square":
        return phase < 0.5 ? 1 : -1;

      case "sawtooth":
        // Rising sawtooth: -1 to 1
        return phase * 2 - 1;

      case "sawtoothDown":
        // Falling sawtooth: 1 to -1
        return 1 - phase * 2;

      default:
        return Math.sin(phase * 2 * Math.PI);
    }
  }

  /**
   * Scale raw waveform (-1 to 1) to output range.
   */
  private scaleToRange(raw: number): number {
    // Map -1..1 to 0..1, then scale to rangeMin..rangeMax
    const normalized = (raw + 1) / 2;
    return this.rangeMin + normalized * (this.rangeMax - this.rangeMin);
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
    const phaseIncrement = this.frequencyHz / sampleRate;

    // Process each output channel (voice)
    for (let ch = 0; ch < outputChannels && ch < MAX_VOICES; ch++) {
      const channelOutput = output[ch];
      if (!channelOutput) continue;

      for (let i = 0; i < frames; i++) {
        // If one-shot is complete for this voice, output the final value
        if (this.oneShot && this.oneShotComplete[ch]) {
          // Output the end-of-cycle value (phase = 1)
          const raw = this.generateWaveform(1);
          channelOutput[i] = this.scaleToRange(raw);
          continue;
        }

        // Generate output at current phase
        const raw = this.generateWaveform(this.phases[ch] ?? 0);
        channelOutput[i] = this.scaleToRange(raw);

        // Advance phase
        this.phases[ch] = (this.phases[ch] ?? 0) + phaseIncrement;

        // Handle cycle completion
        if (this.phases[ch]! >= 1) {
          if (this.oneShot) {
            // Clamp to 1 and mark complete
            this.phases[ch] = 1;
            this.oneShotComplete[ch] = 1;
          } else {
            // Wrap for continuous mode
            this.phases[ch] = this.phases[ch]! % 1;
          }
        }
      }
    }

    return true;
  }
}

registerProcessor("lfo", LfoProcessor);
