export type VcaState = {
  // Base gain (0-1), CV is multiplied by this
  baseGain: number;
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    vca: VcaState;
  }
}
