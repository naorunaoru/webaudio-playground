export type EnvelopePhase = {
  id: string;
  targetLevel: number;  // 0-1, level to reach at end of this phase
  durationMs: number;   // Time to reach target level
  shape: number;        // -1 to 1, curve shape
  hold: boolean;        // If true, hold at targetLevel until gate-off
  loopStart?: boolean;  // If true, marks the start of a loop region
};

export type EnvelopeState = {
  phases: EnvelopePhase[];
  retrigger: boolean;
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    envelope: EnvelopeState;
  }
}
