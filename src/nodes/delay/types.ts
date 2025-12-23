export type DelayState = {
  delayMs: number; // 0..5000
  feedback: number; // 0..0.98
  mix: number; // 0..1
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    delay: DelayState;
  }
}

