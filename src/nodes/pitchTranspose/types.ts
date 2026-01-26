export type PitchTransposeState = {
  semitones: number; // -24..24
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    pitchTranspose: PitchTransposeState;
  }
}
