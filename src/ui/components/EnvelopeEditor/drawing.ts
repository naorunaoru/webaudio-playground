import type { EnvelopePhase } from "@nodes/envelope/types";
import { createCoordinateSystem } from "./geometry";

export type Playhead = {
  ms: number;
  level: number;
};

export type MarkerDragVisual = {
  markerType: "loopStart" | "hold";
  originalPhaseIndex: number;
  currentX: number;
};

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
