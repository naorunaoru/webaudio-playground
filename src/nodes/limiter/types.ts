export type LimiterState = {
  ceilingDb: number; // -60..0
  releaseMs: number; // 1..5000
  makeupDb: number; // -24..24
  bypass: boolean;
  stereoLink: boolean;
  channelCount: 1 | 2;
  lookaheadMs: number; // reserved (v1 keeps at 0)
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    limiter: LimiterState;
  }
}

