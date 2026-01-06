const TWO_PI = Math.PI * 2;

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

type ResetPhaseMessage = { type: "resetPhase" };

class PmOscillatorProcessor extends AudioWorkletProcessor {
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
        name: "feedback",
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      },
    ];
  }

  private phase = 0;
  private prevOut = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data as ResetPhaseMessage | null;
      if (!data) return;
      if (data.type === "resetPhase") {
        this.phase = 0;
        this.prevOut = 0;
      }
    };
  }

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
    const mod = input && input.length > 0 ? input[0]! : null;

    const freqArr = parameters.frequency ?? new Float32Array([440]);
    const fbArr = parameters.feedback ?? new Float32Array([0]);

    let phase = this.phase;
    let prevOut = this.prevOut;

    for (let i = 0; i < frames; i++) {
      const freq = freqArr.length > 1 ? freqArr[i]! : freqArr[0]!;
      const fb = fbArr.length > 1 ? fbArr[i]! : fbArr[0]!;
      const modRad = mod ? mod[i] ?? 0 : 0;

      phase += (TWO_PI * clamp(freq, 0, 20000)) / sampleRate;
      if (phase >= TWO_PI) phase -= TWO_PI * Math.floor(phase / TWO_PI);

      const fbRad = clamp(fb, 0, 1) * Math.PI;
      const y = Math.sin(phase + modRad + prevOut * fbRad);
      out0[i] = y;
      prevOut = y;
    }

    for (let c = 1; c < output.length; c++) {
      const outC = output[c]!;
      for (let i = 0; i < frames; i++) outC[i] = out0[i]!;
    }

    this.phase = phase;
    this.prevOut = prevOut;
    return true;
  }
}

registerProcessor("pmOscillator", PmOscillatorProcessor);

export {};
