export type ReverbState = {
  seconds: number; // 0.1..10
  decay: number; // 0.1..20
  preDelayMs: number; // 0..1000
  mix: number; // 0..1
  reverse: boolean;
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    reverb: ReverbState;
  }
}

