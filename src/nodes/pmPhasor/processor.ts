const TWO_PI = Math.PI * 2;

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

class PmPhasorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "frequency",
        defaultValue: 440,
        minValue: 0,
        maxValue: 20000,
        automationRate: "a-rate",
      },
      {
        name: "reset",
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: "a-rate",
      },
      {
        name: "resetThreshold",
        defaultValue: 0.5,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      },
    ];
  }

  private phase = 0;
  private lastResetHigh = false;

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const out0 = output[0]!;
    const frames = out0.length;

    const freqArr = parameters.frequency ?? new Float32Array([440]);
    const resetArr = parameters.reset ?? new Float32Array([0]);
    const thrArr = parameters.resetThreshold ?? new Float32Array([0.5]);

    let phase = this.phase;
    let lastResetHigh = this.lastResetHigh;

    const threshold = clamp(thrArr.length > 0 ? thrArr[0]! : 0.5, 0, 1);

    for (let i = 0; i < frames; i++) {
      const freq = freqArr.length > 1 ? freqArr[i]! : freqArr[0]!;
      const resetV = resetArr.length > 1 ? resetArr[i]! : resetArr[0]!;
      const isHigh = resetV > threshold;
      if (isHigh && !lastResetHigh) phase = 0;
      lastResetHigh = isHigh;

      phase += (TWO_PI * clamp(freq, 0, 20000)) / sampleRate;
      if (phase >= TWO_PI) phase -= TWO_PI * Math.floor(phase / TWO_PI);

      out0[i] = phase;
    }

    for (let c = 1; c < output.length; c++) {
      const outC = output[c]!;
      for (let i = 0; i < frames; i++) outC[i] = out0[i]!;
    }

    this.phase = phase;
    this.lastResetHigh = lastResetHigh;
    return true;
  }
}

registerProcessor("pmPhasor", PmPhasorProcessor);

export {};

