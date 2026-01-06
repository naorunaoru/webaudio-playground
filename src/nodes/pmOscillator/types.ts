export type PmOscillatorState = {
  ratio: number; // 0.25..16
  detuneCents: number; // -1200..1200
  feedback: number; // 0..1 (internal self-feedback amount)
  resetPhaseOnNoteOn: boolean;
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    pmOscillator: PmOscillatorState;
  }
}
