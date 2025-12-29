export type GainState = {
  depth: number; // 0..2 (scales incoming envelope)
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    gain: GainState;
  }
}

