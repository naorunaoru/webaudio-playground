export type PmSinState = {
  feedback: number; // 0..1
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    pmSin: PmSinState;
  }
}

