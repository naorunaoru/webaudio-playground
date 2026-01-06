export type GainState = {
  base: number; // 0..2 (base gain when unmodulated)
  depth: number; // 0..2 (scales incoming envelope)
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    gain: GainState;
  }
}
