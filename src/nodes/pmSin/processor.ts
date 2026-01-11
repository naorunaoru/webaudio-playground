const TWO_PI = Math.PI * 2;

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

class PmSinProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "feedback",
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      },
    ];
  }

  private prevOut = 0;

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const out0 = output[0]!;
    const frames = out0.length;

    const input = inputs[0];
    const phase = input && input.length > 0 ? input[0]! : null;

    const fbArr = parameters.feedback ?? new Float32Array([0]);
    const fb = clamp(fbArr.length > 0 ? fbArr[0]! : 0, 0, 1);
    const fbRad = fb * Math.PI;

    let prevOut = this.prevOut;

    for (let i = 0; i < frames; i++) {
      const p = phase ? phase[i] ?? 0 : 0;
      const pWrapped = p - TWO_PI * Math.floor(p / TWO_PI);
      const y = Math.sin(pWrapped + prevOut * fbRad);
      out0[i] = y;
      prevOut = y;
    }

    for (let c = 1; c < output.length; c++) {
      const outC = output[c]!;
      for (let i = 0; i < frames; i++) outC[i] = out0[i]!;
    }

    this.prevOut = prevOut;
    return true;
  }
}

registerProcessor("pmSin", PmSinProcessor);

export {};

