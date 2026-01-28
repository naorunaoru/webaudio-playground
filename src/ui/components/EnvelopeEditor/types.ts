import type { EnvelopePhase } from "@nodes/envelope/types";
import type { EnvelopeRuntimeState } from "@nodes/envelope/audio";

/** Handle index: 0 to N-1 for each phase endpoint */
export type HandleIndex = number;

/** Segment index: 0 to N-1 for each phase curve */
export type SegmentIndex = number;

export type EnvelopeEditorProps = Readonly<{
  phases: EnvelopePhase[];
  onChangePhases: (next: EnvelopePhase[]) => void;
  getRuntimeState?: () => EnvelopeRuntimeState | undefined;
  height?: number;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** Currently selected phase index (controlled) */
  selectedPhase?: number | null;
  /** Called when selection changes */
  onSelectPhase?: (index: number | null) => void;
}>;

export type CanvasMetrics = {
  rect: DOMRect;
  dpr: number;
  width: number;
  height: number;
};

export type CurveDragState = {
  segmentIndex: SegmentIndex;
  startY: number;
  startShape: number;
};
