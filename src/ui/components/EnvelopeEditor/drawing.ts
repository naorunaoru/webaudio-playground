import type { EnvelopePhase } from "@nodes/envelope/types";
import type { HandleIndex } from "./types";
import type { SegmentPoints } from "./geometry";
import {
  createCoordinateSystem,
  getEnvelopeSegmentPoints,
  getHandlePositions,
  cumulativeTimeBeforePhase,
} from "./geometry";

export type Playhead = {
  ms: number;
  level: number;
};

/**
 * Choose a nice round interval for grid lines based on total duration.
 * Returns an interval in milliseconds that produces 3-8 grid lines.
 */
function chooseTimeInterval(totalMs: number): number {
  // Nice round intervals to choose from (in ms)
  const intervals = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

  for (const interval of intervals) {
    const lineCount = Math.floor(totalMs / interval);
    if (lineCount >= 3 && lineCount <= 8) {
      return interval;
    }
  }

  // Fallback: if total is very small or very large, compute a reasonable interval
  const targetLines = 5;
  const rawInterval = totalMs / targetLines;
  // Round to nearest nice number
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)));
  const normalized = rawInterval / magnitude;

  let nice: number;
  if (normalized <= 1.5) nice = 1;
  else if (normalized <= 3) nice = 2;
  else if (normalized <= 7) nice = 5;
  else nice = 10;

  return nice * magnitude;
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  pad: number,
  w: number,
  h: number,
  dpr: number,
  totalMs: number,
  xOfMs: (ms: number) => number
) {
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1 * dpr;
  ctx.beginPath();

  // Vertical lines at time intervals
  const interval = chooseTimeInterval(totalMs);
  for (let ms = interval; ms < totalMs; ms += interval) {
    const x = xOfMs(ms);
    ctx.moveTo(x, pad);
    ctx.lineTo(x, pad + h);
  }

  // Horizontal lines: keep simple 3-line grid (0, 0.5, 1.0)
  for (let i = 0; i <= 2; i++) {
    const y = pad + (h * i) / 2;
    ctx.moveTo(pad, y);
    ctx.lineTo(pad + w, y);
  }
  ctx.stroke();
}

function drawCurve(
  ctx: CanvasRenderingContext2D,
  segments: SegmentPoints[],
  dpr: number
) {
  if (segments.length === 0) return;

  // Draw all segments as one continuous path
  ctx.strokeStyle = "rgba(236,239,244,0.9)";
  ctx.lineWidth = 1.75 * dpr;
  ctx.beginPath();

  let started = false;
  for (const segment of segments) {
    for (let i = 0; i < segment.points.length; i++) {
      const pt = segment.points[i]!;
      if (!started) {
        ctx.moveTo(pt.x, pt.y);
        started = true;
      } else {
        ctx.lineTo(pt.x, pt.y);
      }
    }
  }
  ctx.stroke();
}

function drawDashedLine(
  ctx: CanvasRenderingContext2D,
  x: number,
  pad: number,
  h: number,
  dpr: number,
  color: string
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5 * dpr;
  ctx.setLineDash([3 * dpr, 3 * dpr]);
  ctx.beginPath();
  ctx.moveTo(x, pad);
  ctx.lineTo(x, pad + h);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawMarkerLines(
  ctx: CanvasRenderingContext2D,
  phases: EnvelopePhase[],
  segments: SegmentPoints[],
  pad: number,
  h: number,
  dpr: number,
  markerDrag?: MarkerDragVisual | null
) {
  for (let i = 0; i < segments.length; i++) {
    const phase = phases[i];
    if (i >= phases.length - 1) continue;

    const segment = segments[i]!;
    const lastPt = segment.points[segment.points.length - 1]!;
    const x = lastPt.x;

    // Skip the line for the marker being dragged (it'll be drawn at drag position)
    if (phase?.loopStart && !(markerDrag?.markerType === "loopStart")) {
      drawDashedLine(ctx, x, pad, h, dpr, "rgba(129,140,248,0.5)");
    }

    if (phase?.hold && !(markerDrag?.markerType === "hold")) {
      drawDashedLine(ctx, x, pad, h, dpr, "rgba(236,72,153,0.5)");
    }
  }

  // Draw dashed line at dragged marker's current position
  if (markerDrag) {
    const color = markerDrag.markerType === "loopStart"
      ? "rgba(129,140,248,0.5)"
      : "rgba(236,72,153,0.5)";
    drawDashedLine(ctx, markerDrag.currentX, pad, h, dpr, color);
  }
}

/**
 * Draw a tinted background for the loop region (from loopStart to hold).
 */
function drawLoopRegion(
  ctx: CanvasRenderingContext2D,
  phases: EnvelopePhase[],
  pad: number,
  h: number,
  xOfMs: (ms: number) => number,
  cumulativeTimeBeforePhase: (phases: EnvelopePhase[], index: number) => number
) {
  // Find loopStart and hold indices
  let loopStartIdx = -1;
  let holdIdx = -1;

  for (let i = 0; i < phases.length; i++) {
    if (phases[i]?.loopStart) loopStartIdx = i;
    if (phases[i]?.hold) holdIdx = i;
  }

  // Only draw if both exist and loopStart <= hold
  if (loopStartIdx < 0 || holdIdx < 0 || loopStartIdx > holdIdx) return;

  // Loop region starts at the END of loopStart phase (where the marker is)
  // and ends at the END of hold phase (where the hold marker is)
  const startMs = cumulativeTimeBeforePhase(phases, loopStartIdx) + phases[loopStartIdx]!.durationMs;
  const endMs = cumulativeTimeBeforePhase(phases, holdIdx) + phases[holdIdx]!.durationMs;

  const x1 = xOfMs(startMs);
  const x2 = xOfMs(endMs);

  ctx.fillStyle = "rgba(129,140,248,0.08)"; // Subtle indigo tint
  ctx.fillRect(x1, pad, x2 - x1, h);
}

function drawPlayhead(
  ctx: CanvasRenderingContext2D,
  playhead: Playhead,
  totalMs: number,
  pad: number,
  h: number,
  xOfMs: (ms: number) => number,
  dpr: number,
  alpha: number = 0.65
) {
  const clamped = Math.max(0, Math.min(totalMs, playhead.ms));
  const x = xOfMs(clamped);

  ctx.strokeStyle = `rgba(236,72,153,${alpha})`;
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  ctx.moveTo(x, pad);
  ctx.lineTo(x, pad + h);
  ctx.stroke();
}

function drawHandle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  isActive: boolean,
  isSelected: boolean,
  dpr: number
) {
  const radius = (isActive || isSelected ? 5 : 4) * dpr;

  if (isSelected) {
    ctx.fillStyle = "rgba(236,72,153,0.95)";
  } else if (isActive) {
    ctx.fillStyle = "rgba(255,255,255,0.95)";
  } else {
    ctx.fillStyle = "rgba(236,239,244,0.75)";
  }

  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawMarkerHandle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  dpr: number
) {
  const radius = 4 * dpr;
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

export type MarkerDragVisual = {
  markerType: "loopStart" | "hold";
  originalPhaseIndex: number;
  currentX: number;
};

export function drawEnvelope(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  phases: EnvelopePhase[],
  activeHandle: HandleIndex | null,
  selectedHandle: HandleIndex | null,
  playheads: Playhead[],
  markerDrag?: MarkerDragVisual | null
) {
  ctx.clearRect(0, 0, width, height);

  if (phases.length === 0) return;

  const coords = createCoordinateSystem(width, height, dpr, phases);
  const { pad, w, h, totalMs, xOfMs } = coords;

  drawGrid(ctx, pad, w, h, dpr, totalMs, xOfMs);

  // Draw loop region background (before curve so it's behind)
  drawLoopRegion(ctx, phases, pad, h, xOfMs, cumulativeTimeBeforePhase);

  const segments = getEnvelopeSegmentPoints(phases, coords);
  drawMarkerLines(ctx, phases, segments, pad, h, dpr, markerDrag);
  drawCurve(ctx, segments, dpr);

  // Draw all playheads with decreasing opacity for secondary voices
  for (let i = 0; i < playheads.length; i++) {
    const playhead = playheads[i]!;
    // First playhead is full opacity, others fade slightly
    const alpha = i === 0 ? 0.65 : Math.max(0.25, 0.5 - i * 0.05);
    drawPlayhead(ctx, playhead, totalMs, pad, h, xOfMs, dpr, alpha);
  }

  const handles = getHandlePositions(phases, coords);
  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i]!;
    drawHandle(
      ctx,
      handle.x,
      handle.y,
      activeHandle === i,
      selectedHandle === i,
      dpr
    );
  }

  // Draw marker handles: loopStart at top, hold at bottom
  // Skip the dragged marker type in the loop — it's drawn separately below
  const topY = pad;
  const bottomY = pad + h;
  for (let i = 0; i < phases.length - 1; i++) {
    const phase = phases[i]!;
    const handle = handles[i]!;
    if (phase.loopStart && !(markerDrag?.markerType === "loopStart")) {
      drawMarkerHandle(ctx, handle.x, topY, "rgba(129,140,248,0.9)", dpr);
    }
    if (phase.hold && !(markerDrag?.markerType === "hold")) {
      drawMarkerHandle(ctx, handle.x, bottomY, "rgba(236,72,153,0.9)", dpr);
    }
  }

  // Draw the dragged marker handle at its current drag position
  if (markerDrag) {
    const color = markerDrag.markerType === "loopStart"
      ? "rgba(129,140,248,0.9)"
      : "rgba(236,72,153,0.9)";
    const y = markerDrag.markerType === "loopStart" ? topY : bottomY;
    drawMarkerHandle(ctx, markerDrag.currentX, y, color, dpr);
  }
}

/**
 * Compute the level at a given phase index and progress.
 */
export function computeLevelAtPhase(
  phases: EnvelopePhase[],
  phaseIndex: number,
  progress: number
): number {
  if (phaseIndex < 0 || phases.length === 0) return 0;
  if (phaseIndex >= phases.length) return phases[phases.length - 1]?.targetLevel ?? 0;

  const phase = phases[phaseIndex]!;
  const prevLevel = phaseIndex > 0 ? phases[phaseIndex - 1]!.targetLevel : 0;

  // Linear interpolation (actual shaping is in the processor)
  return prevLevel + (phase.targetLevel - prevLevel) * Math.max(0, Math.min(1, progress));
}
