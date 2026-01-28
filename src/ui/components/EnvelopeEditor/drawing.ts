import type { EnvelopePhase } from "@nodes/envelope/types";
import type { SegmentPoints } from "./geometry";
import {
  createCoordinateSystem,
  getEnvelopeSegmentPoints,
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
  xOfMs: (ms: number) => number,
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
  dpr: number,
) {
  if (segments.length === 0) return;

  // Draw all segments as one continuous path
  ctx.strokeStyle = "rgba(236,239,244,0.9)";
  ctx.lineWidth = 1.25 * dpr;
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

/**
 * Draw a tinted background for the loop region (from loopStart to hold).
 */
function drawLoopRegion(
  ctx: CanvasRenderingContext2D,
  phases: EnvelopePhase[],
  pad: number,
  h: number,
  xOfMs: (ms: number) => number,
  cumulativeTimeBeforePhase: (phases: EnvelopePhase[], index: number) => number,
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
  const startMs =
    cumulativeTimeBeforePhase(phases, loopStartIdx) +
    phases[loopStartIdx]!.durationMs;
  const endMs =
    cumulativeTimeBeforePhase(phases, holdIdx) + phases[holdIdx]!.durationMs;

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
  alpha: number = 0.65,
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

export type MarkerDragVisual = {
  markerType: "loopStart" | "hold";
  originalPhaseIndex: number;
  currentX: number;
};

/**
 * Draw the static envelope shape: grid, loop region background, curve.
 * Redrawn only when phases change or canvas resizes.
 */
export function drawEnvelopeShape(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  phases: EnvelopePhase[],
) {
  ctx.clearRect(0, 0, width, height);
  if (phases.length === 0) return;

  const coords = createCoordinateSystem(width, height, dpr, phases);
  const { pad, w, h, totalMs, xOfMs } = coords;

  drawGrid(ctx, pad, w, h, dpr, totalMs, xOfMs);
  drawLoopRegion(ctx, phases, pad, h, xOfMs, cumulativeTimeBeforePhase);

  const segments = getEnvelopeSegmentPoints(phases, coords);
  drawCurve(ctx, segments, dpr);
}

/**
 * Draw playhead lines only.
 * Redrawn continuously via rAF while voices are active.
 */
export function drawEnvelopePlayheads(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  phases: EnvelopePhase[],
  playheads: Playhead[],
  count: number = playheads.length,
) {
  ctx.clearRect(0, 0, width, height);
  if (phases.length === 0 || count === 0) return;

  const coords = createCoordinateSystem(width, height, dpr, phases);
  const { pad, h, totalMs, xOfMs } = coords;

  for (let i = 0; i < count; i++) {
    const playhead = playheads[i]!;
    const alpha = i === 0 ? 0.65 : Math.max(0.25, 0.5 - i * 0.05);
    drawPlayhead(ctx, playhead, totalMs, pad, h, xOfMs, dpr, alpha);
  }
}

/**
 * Compute the level at a given phase index and progress.
 */
export function computeLevelAtPhase(
  phases: EnvelopePhase[],
  phaseIndex: number,
  progress: number,
): number {
  if (phaseIndex < 0 || phases.length === 0) return 0;
  if (phaseIndex >= phases.length)
    return phases[phases.length - 1]?.targetLevel ?? 0;

  const phase = phases[phaseIndex]!;
  const prevLevel = phaseIndex > 0 ? phases[phaseIndex - 1]!.targetLevel : 0;

  // Linear interpolation (actual shaping is in the processor)
  return (
    prevLevel +
    (phase.targetLevel - prevLevel) * Math.max(0, Math.min(1, progress))
  );
}
