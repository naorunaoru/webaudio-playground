export type AttenuatorState = {
  amount: number; // 0..4
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    attenuator: AttenuatorState;
  }
}
