/**
 * VCO (Voltage Controlled Oscillator) AudioWorklet Processor
 *
 * Receives V/oct pitch CV input (N channels) and outputs audio (N channels).
 * Each channel runs an independent oscillator.
 *
 * V/oct reference: 0V = C0 (MIDI note 0)
 * Formula: Hz = A4 * 2^(vOct - 69/12)
 *
 * Where vOct = midiNote / 12, so at MIDI note 69 (A4), Hz = A4.
 */

// Default A4 frequency
const DEFAULT_A4_HZ = 440;

// A4's V/oct value (69/12)
const A4_VOCT = 69 / 12;

// Minimum/maximum frequency bounds
const MIN_FREQ_HZ = 10;
const MAX_FREQ_HZ = 20000;

// Sentinel value indicating silent channel (must match PITCH_SILENT in midiToCv)
const PITCH_SILENT = -1000;

type VcoWaveform = "sine" | "triangle" | "square" | "sawtooth";

type VcoMessage =
  | { type: "params"; waveform: VcoWaveform }
  | { type: "setVoiceCount"; count: number }
  | { type: "setA4"; a4Hz: number };

class VcoProcessor extends AudioWorkletProcessor {
  private waveform: VcoWaveform = "sawtooth";
  private voiceCount = 8;
  private a4Hz = DEFAULT_A4_HZ;

  // Phase accumulators per voice (0-1)
  private phases: Float64Array;

  constructor() {
    super();
    this.phases = new Float64Array(16);

    this.port.onmessage = (event: MessageEvent<VcoMessage>) => {
      const data = event.data;
      if (data.type === "params") {
        this.waveform = data.waveform;
      } else if (data.type === "setVoiceCount") {
        this.voiceCount = Math.max(1, Math.min(16, data.count));
        // Expand phases array if needed
        if (this.phases.length < this.voiceCount) {
          const newPhases = new Float64Array(this.voiceCount);
          newPhases.set(this.phases);
          this.phases = newPhases;
        }
      } else if (data.type === "setA4") {
        this.a4Hz = data.a4Hz;
      }
    };
  }

  /**
   * Convert V/oct to Hz using A4 reference.
   * V/oct = midiNote / 12
   * Hz = A4 * 2^(vOct - 69/12) = A4 * 2^(vOct - A4_VOCT)
   */
  private vOctToHz(vOct: number): number {
    const hz = this.a4Hz * Math.pow(2, vOct - A4_VOCT);
    return Math.max(MIN_FREQ_HZ, Math.min(MAX_FREQ_HZ, hz));
  }

  /**
   * Generate waveform sample from phase (0-1).
   */
  private generateSample(phase: number): number {
    switch (this.waveform) {
      case "sine":
        return Math.sin(phase * 2 * Math.PI);

      case "triangle":
        // Triangle: linear ramp up then down
        if (phase < 0.5) {
          return 4 * phase - 1;
        } else {
          return 3 - 4 * phase;
        }

      case "square":
        return phase < 0.5 ? 1 : -1;

      case "sawtooth":
        // Sawtooth: ramp from -1 to 1
        return 2 * phase - 1;

      default:
        return 0;
    }
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>
  ): boolean {
    const pitchInput = inputs[0]; // V/oct pitch CV input
    const phaseModInput = inputs[1]; // Phase modulation CV input
    const audioOutput = outputs[0]; // Audio output

    if (!audioOutput || audioOutput.length === 0) return true;

    const frames = audioOutput[0]?.length ?? 0;
    if (frames === 0) return true;

    const outputChannels = audioOutput.length;
    const inputChannels = pitchInput?.length ?? 0;
    const phaseModChannels = phaseModInput?.length ?? 0;
    const invSampleRate = 1 / sampleRate;

    // Process each output channel
    for (let ch = 0; ch < outputChannels; ch++) {
      const output = audioOutput[ch];
      if (!output) continue;

      // If no pitch input for this channel, output silence
      if (ch >= inputChannels || !pitchInput![ch]) {
        output.fill(0);
        continue;
      }

      const pitchCv = pitchInput![ch]!;
      const phaseModCv = ch < phaseModChannels ? phaseModInput![ch] : null;

      for (let i = 0; i < frames; i++) {
        // Get pitch CV for this sample (V/oct)
        const vOct = pitchCv[i] ?? PITCH_SILENT;

        // Output silence for sentinel value (inactive voice)
        if (vOct <= PITCH_SILENT + 1) {
          output[i] = 0;
          continue;
        }

        const freq = this.vOctToHz(vOct);

        // Get phase modulation offset (0 if not connected)
        // Phase mod input is expected in range [-1, 1] which maps to [-1, 1] phase offset
        const phaseMod = phaseModCv?.[i] ?? 0;

        // Generate sample at current phase + modulation offset
        // Use modulo to wrap phase into [0, 1) range
        const modulatedPhase = (((this.phases[ch] ?? 0) + phaseMod) % 1 + 1) % 1;
        output[i] = this.generateSample(modulatedPhase);

        // Advance phase (base phase accumulator is unaffected by modulation)
        const phaseIncrement = freq * invSampleRate;
        this.phases[ch] = ((this.phases[ch] ?? 0) + phaseIncrement) % 1;
      }
    }

    return true;
  }
}

registerProcessor("vco", VcoProcessor);
