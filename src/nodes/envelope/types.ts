export type EnvelopeEnv = {
  attackMs: number;
  decayMs: number;
  sustain: number; // 0..1
  releaseMs: number;
  /** Curve shape in range [-1..1]. 0 = linear. Positive = more exponential-like. */
  attackShape: number;
  /** Curve shape in range [-1..1]. 0 = linear. Positive = more exponential-like. */
  decayShape: number;
  /** Curve shape in range [-1..1]. 0 = linear. Positive = more exponential-like. */
  releaseShape: number;
};

export type EnvelopeState = {
  env: EnvelopeEnv;
  lastMidiNote: number | null;
  lastMidiAtMs: number | null;
  lastMidiOffAtMs: number | null;
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    envelope: EnvelopeState;
  }
}
