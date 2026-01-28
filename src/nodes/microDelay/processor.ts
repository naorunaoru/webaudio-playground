/**
 * MicroDelay AudioWorklet Processor
 *
 * Provides very short delays (down to 1 sample) for FM feedback loops
 * and other applications requiring sub-millisecond timing.
 *
 * Uses a simple ring buffer per channel.
 */

// Maximum delay in milliseconds (at 48kHz this is ~2400 samples)
const MAX_DELAY_MS = 50;

type MicroDelayMessage = { type: "params"; delayMs: number };

class MicroDelayProcessor extends AudioWorkletProcessor {
  private delayMs = 0.02; // Default ~1 sample at 48kHz
  private maxDelaySamples: number;
  private buffers: Float32Array[] = [];
  private writeIndices: number[] = [];

  constructor() {
    super();

    // Calculate max buffer size based on sample rate
    this.maxDelaySamples = Math.ceil((MAX_DELAY_MS / 1000) * sampleRate);

    this.port.onmessage = (event: MessageEvent<MicroDelayMessage>) => {
      const data = event.data;
      if (data.type === "params") {
        this.delayMs = Math.max(0, Math.min(MAX_DELAY_MS, data.delayMs));
      }
    };
  }

  private ensureBuffer(channel: number): void {
    if (!this.buffers[channel]) {
      this.buffers[channel] = new Float32Array(this.maxDelaySamples);
      this.writeIndices[channel] = 0;
    }
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>
  ): boolean {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !output || input.length === 0 || output.length === 0) {
      return true;
    }

    const frames = output[0]?.length ?? 0;
    if (frames === 0) return true;

    // Calculate delay in samples (minimum 1 sample to break feedback loops)
    const delaySamples = Math.max(1, Math.round((this.delayMs / 1000) * sampleRate));

    const numChannels = Math.min(input.length, output.length);

    for (let ch = 0; ch < numChannels; ch++) {
      const inputChannel = input[ch];
      const outputChannel = output[ch];

      if (!inputChannel || !outputChannel) continue;

      this.ensureBuffer(ch);
      const buffer = this.buffers[ch]!;
      let writeIdx = this.writeIndices[ch]!;

      for (let i = 0; i < frames; i++) {
        // Write input to buffer
        buffer[writeIdx] = inputChannel[i]!;

        // Read from delay position (wrapping around)
        const readIdx = (writeIdx - delaySamples + this.maxDelaySamples) % this.maxDelaySamples;
        outputChannel[i] = buffer[readIdx]!;

        // Advance write position
        writeIdx = (writeIdx + 1) % this.maxDelaySamples;
      }

      this.writeIndices[ch] = writeIdx;
    }

    return true;
  }
}

registerProcessor("micro-delay", MicroDelayProcessor);
