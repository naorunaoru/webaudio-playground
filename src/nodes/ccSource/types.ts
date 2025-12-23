export type CcSourceState = {
  controller: number;
  value: number; // 0..127
  channel: number;
  lastSentAtMs: number | null;
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    ccSource: CcSourceState;
  }
}

