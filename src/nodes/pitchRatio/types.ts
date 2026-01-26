export type PitchRatioState = {
  numerator: number; // 1..16
  denominator: number; // 1..16
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    pitchRatio: PitchRatioState;
  }
}
