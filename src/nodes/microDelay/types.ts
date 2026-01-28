export type MicroDelayState = {
  delayMs: number; // 0.01..50 (very short delays for FM feedback, up to chorus/flanger range)
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    microDelay: MicroDelayState;
  }
}
