export type EnvCurve = "linear" | "exp";

export type OscillatorEnv = {
  attackMs: number;
  decayMs: number;
  sustain: number; // 0..1
  releaseMs: number;
  attackCurve: EnvCurve;
  decayCurve: EnvCurve;
  releaseCurve: EnvCurve;
};

export type OscillatorState = {
  waveform: OscillatorType;
  detuneCents: number;
  env: OscillatorEnv;
  lastMidiNote: number | null;
  lastMidiAtMs: number | null;
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    oscillator: OscillatorState;
  }
}

