export type PmPhasorState = {
  resetThreshold: number; // 0..1
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    pmPhasor: PmPhasorState;
  }
}

