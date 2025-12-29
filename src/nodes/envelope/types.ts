export type EnvCurve = "linear" | "exp";

export type EnvelopeEnv = {
  attackMs: number;
  decayMs: number;
  sustain: number; // 0..1
  releaseMs: number;
  attackCurve: EnvCurve;
  decayCurve: EnvCurve;
  releaseCurve: EnvCurve;
};

export type EnvelopeState = {
  env: EnvelopeEnv;
  lastMidiNote: number | null;
  lastMidiAtMs: number | null;
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    envelope: EnvelopeState;
  }
}

