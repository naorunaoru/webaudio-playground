import { invTFromU } from "@utils/envelope";
import { clamp01 } from "@utils/math";
import type { EnvelopePhase } from "@nodes/envelope/types";
import type { CanvasMetrics, HandleIndex, SegmentIndex } from "./types";

export const HANDLE_BLEED_PX = 8;

export function getCanvasMetrics(canvas: HTMLCanvasElement): CanvasMetrics {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  return { rect, dpr, width, height };
}

export function clampMs(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(5000, v));
}

export type CoordinateSystem = {
  pad: number;
  w: number;
  h: number;
  totalMs: number;
  xOfMs: (ms: number) => number;
  yOfLevel: (level: number) => number;
  msOfX: (x: number) => number;
  levelOfY: (y: number) => number;
};

/**
 * Compute total duration of all phases.
 */
export function computeTotalDuration(phases: EnvelopePhase[]): number {
  let total = 0;
  for (const phase of phases) {
    total += Math.max(0, phase.durationMs);
  }
  return total;
}

/**
 * Compute cumulative time up to (but not including) a phase index.
 */
export function cumulativeTimeBeforePhase(phases: EnvelopePhase[], phaseIndex: number): number {
  let total = 0;
  for (let i = 0; i < phaseIndex && i < phases.length; i++) {
    total += Math.max(0, phases[i]!.durationMs);
  }
  return total;
}

export function createCoordinateSystem(
  canvasWidth: number,
  canvasHeight: number,
  dpr: number,
  phases: EnvelopePhase[]
): CoordinateSystem {
  const pad = HANDLE_BLEED_PX * dpr;
  const w = canvasWidth - pad * 2;
  const h = canvasHeight - pad * 2;
  const totalMs = Math.max(1, computeTotalDuration(phases));

  return {
    pad,
    w,
    h,
    totalMs,
    xOfMs: (ms: number) => pad + (ms / totalMs) * w,
    yOfLevel: (level: number) => pad + (1 - clamp01(level)) * h,
    msOfX: (x: number) => ((x - pad) / w) * totalMs,
    levelOfY: (y: number) => clamp01(1 - (y - pad) / h),
  };
}

export type HandlePosition = {
  x: number;
  y: number;
  phaseIndex: number;
};

/**
 * Get positions of all handles (one per phase endpoint).
 * Handle i is at the end of phase i.
 */
export function getHandlePositions(
  phases: EnvelopePhase[],
  coords: CoordinateSystem
): HandlePosition[] {
  const { xOfMs, yOfLevel } = coords;
  const handles: HandlePosition[] = [];

  let cumulativeMs = 0;
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i]!;
    cumulativeMs += Math.max(0, phase.durationMs);
    handles.push({
      x: xOfMs(cumulativeMs),
      y: yOfLevel(phase.targetLevel),
      phaseIndex: i,
    });
  }

  return handles;
}

/**
 * Generate points for a single segment (phase curve).
 */
export function segmentPoints(
  ms0: number,
  ms1: number,
  level0: number,
  level1: number,
  shape: number,
  xOfMs: (ms: number) => number,
  yOfLevel: (level: number) => number,
  samples = 64
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  const span = Math.max(0, ms1 - ms0);
  for (let i = 0; i <= samples; i++) {
    const t = samples === 0 ? 1 : i / samples;
    const u = t;
    const ms = ms0 + span * invTFromU(u, shape);
    const level = level0 + (level1 - level0) * u;
    pts.push({ x: xOfMs(ms), y: yOfLevel(level) });
  }
  return pts;
}

export type SegmentPoints = {
  phaseIndex: number;
  points: Array<{ x: number; y: number }>;
};

/**
 * Get all segment points for drawing the envelope curve.
 */
export function getEnvelopeSegmentPoints(
  phases: EnvelopePhase[],
  coords: CoordinateSystem,
  samples = 64
): SegmentPoints[] {
  const { xOfMs, yOfLevel } = coords;
  const segments: SegmentPoints[] = [];

  let cumulativeMs = 0;
  let prevLevel = 0;

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i]!;
    const startMs = cumulativeMs;
    const endMs = startMs + Math.max(0, phase.durationMs);
    const startLevel = prevLevel;
    const endLevel = phase.targetLevel;

    const points = segmentPoints(
      startMs,
      endMs,
      startLevel,
      endLevel,
      phase.shape,
      xOfMs,
      yOfLevel,
      samples
    );

    segments.push({ phaseIndex: i, points });

    cumulativeMs = endMs;
    prevLevel = endLevel;
  }

  return segments;
}

/**
 * Find the closest handle to a point.
 */
export function findClosestHandle(
  px: number,
  py: number,
  handles: HandlePosition[],
  hitRadius: number
): HandleIndex | null {
  const dist2 = (h: HandlePosition) => (h.x - px) ** 2 + (h.y - py) ** 2;
  const hitR2 = hitRadius ** 2;

  let closest: { index: HandleIndex; d2: number } | null = null;

  for (let i = 0; i < handles.length; i++) {
    const d2 = dist2(handles[i]!);
    if (d2 <= hitR2 && (closest === null || d2 < closest.d2)) {
      closest = { index: i, d2 };
    }
  }

  return closest?.index ?? null;
}

function dist2PointToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const abLen2 = abx * abx + aby * aby;
  const t = abLen2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLen2));
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  return (p.x - cx) ** 2 + (p.y - cy) ** 2;
}

function minDistToPolyline(p: { x: number; y: number }, pts: Array<{ x: number; y: number }>): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    best = Math.min(best, dist2PointToSegment(p, pts[i]!, pts[i + 1]!));
  }
  return best;
}

/**
 * Find the closest segment (phase curve) to a point.
 */
export function findClosestSegment(
  px: number,
  py: number,
  segments: SegmentPoints[],
  hitRadius: number
): SegmentIndex | null {
  const p = { x: px, y: py };
  const hitR2 = hitRadius ** 2;

  let closest: { index: SegmentIndex; d2: number } | null = null;

  for (let i = 0; i < segments.length; i++) {
    const d2 = minDistToPolyline(p, segments[i]!.points);
    if (d2 <= hitR2 && (closest === null || d2 < closest.d2)) {
      closest = { index: i, d2 };
    }
  }

  return closest?.index ?? null;
}

/**
 * Convert a phase index + progress to milliseconds from envelope start.
 */
export function phaseIndexToMs(
  phases: EnvelopePhase[],
  phaseIndex: number,
  progress: number
): number {
  if (phaseIndex < 0 || phases.length === 0) return 0;

  let ms = cumulativeTimeBeforePhase(phases, phaseIndex);

  if (phaseIndex < phases.length) {
    ms += phases[phaseIndex]!.durationMs * clamp01(progress);
  }

  return ms;
}

export type MarkerType = "loopStart" | "hold";

export type MarkerPosition = {
  type: MarkerType;
  phaseIndex: number;
  x: number;
  y: number;
};

/**
 * Get positions of all markers (loopStart and hold indicators).
 * loopStart markers are at the top; hold markers are at the bottom.
 */
export function getMarkerPositions(
  phases: EnvelopePhase[],
  coords: CoordinateSystem
): MarkerPosition[] {
  const { xOfMs, pad, h } = coords;
  const markers: MarkerPosition[] = [];
  const topY = pad;
  const bottomY = pad + h;

  let cumulativeMs = 0;
  for (let i = 0; i < phases.length - 1; i++) { // Exclude last phase
    const phase = phases[i]!;
    cumulativeMs += Math.max(0, phase.durationMs);
    const x = xOfMs(cumulativeMs);

    if (phase.loopStart) {
      markers.push({ type: "loopStart", phaseIndex: i, x, y: topY });
    }
    if (phase.hold) {
      markers.push({ type: "hold", phaseIndex: i, x, y: bottomY });
    }
  }

  return markers;
}

/**
 * Find which marker (if any) is hit at a point.
 */
export function findHitMarker(
  px: number,
  py: number,
  markers: MarkerPosition[],
  hitRadius: number
): MarkerPosition | null {
  const hitR2 = hitRadius ** 2;

  for (const marker of markers) {
    const d2 = (marker.x - px) ** 2 + (marker.y - py) ** 2;
    if (d2 <= hitR2) {
      return marker;
    }
  }

  return null;
}

/**
 * Find the closest handle index to an x-coordinate.
 * Used for snapping markers when dragging.
 */
export function findClosestHandleByX(
  px: number,
  handles: HandlePosition[],
  excludeLastPhase: boolean = true
): HandleIndex | null {
  if (handles.length === 0) return null;

  const maxIndex = excludeLastPhase ? handles.length - 1 : handles.length;
  let closest: { index: HandleIndex; dist: number } | null = null;

  for (let i = 0; i < maxIndex; i++) {
    const dist = Math.abs(handles[i]!.x - px);
    if (closest === null || dist < closest.dist) {
      closest = { index: i, dist };
    }
  }

  return closest?.index ?? null;
}
