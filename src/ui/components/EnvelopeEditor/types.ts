import type { EnvelopeEnv } from "@nodes/envelope/types";
import type { EnvelopeRuntimeState } from "@nodes/envelope/audio";

export type HandleKey = "a" | "d" | "r";
export type SegmentKey = "attack" | "decay" | "release";

export type EnvelopeEditorProps = Readonly<{
  env: EnvelopeEnv;
  onChangeEnv: (next: EnvelopeEnv) => void;
  getRuntimeState?: () => EnvelopeRuntimeState | undefined;
  height?: number;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}>;

export type CanvasMetrics = {
  rect: DOMRect;
  dpr: number;
  width: number;
  height: number;
};

export type CurveDragState = {
  segment: SegmentKey;
  startY: number;
  startShape: number;
};
