import { invTFromU } from "@utils/envelope";
import { clamp01 } from "@utils/math";
import type { EnvelopeEnv } from "@nodes/envelope/types";
import type { CanvasMetrics, HandleKey } from "./types";

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

export function createCoordinateSystem(
  canvasWidth: number,
  canvasHeight: number,
  dpr: number,
  env: EnvelopeEnv
): CoordinateSystem {
  const pad = HANDLE_BLEED_PX * dpr;
  const w = canvasWidth - pad * 2;
  const h = canvasHeight - pad * 2;
  const totalMs = Math.max(1, env.attackMs + env.decayMs + env.releaseMs);

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

export type HandlePositions = {
  attack: { x: number; y: number };
  decay: { x: number; y: number };
  release: { x: number; y: number };
};

export function getHandlePositions(
  env: EnvelopeEnv,
  coords: CoordinateSystem
): HandlePositions {
  const { xOfMs, yOfLevel } = coords;
  return {
    attack: { x: xOfMs(env.attackMs), y: yOfLevel(1) },
    decay: { x: xOfMs(env.attackMs + env.decayMs), y: yOfLevel(env.sustain) },
    release: { x: xOfMs(env.attackMs + env.decayMs + env.releaseMs), y: yOfLevel(0) },
  };
}

export function segmentPoints(
  ms0: number,
  ms1: number,
  level0: number,
  level1: number,
  shape: number,
  xOfMs: (ms: number) => number,
  yOfLevel: (level: number) => number,
  samples = 96
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

export function getEnvelopeSegmentPoints(
  env: EnvelopeEnv,
  coords: CoordinateSystem,
  samples = 64
) {
  const { xOfMs, yOfLevel } = coords;
  const attackPts = segmentPoints(0, env.attackMs, 0, 1, env.attackShape, xOfMs, yOfLevel, samples);
  const decayPts = segmentPoints(
    env.attackMs,
    env.attackMs + env.decayMs,
    1,
    env.sustain,
    env.decayShape,
    xOfMs,
    yOfLevel,
    samples
  );
  const releaseStart = env.attackMs + env.decayMs;
  const releasePts = segmentPoints(
    releaseStart,
    releaseStart + env.releaseMs,
    env.sustain,
    0,
    env.releaseShape,
    xOfMs,
    yOfLevel,
    samples
  );
  return { attackPts, decayPts, releasePts };
}

export function findClosestHandle(
  px: number,
  py: number,
  handles: HandlePositions,
  hitRadius: number
): HandleKey | null {
  const dist2 = (x: number, y: number) => (x - px) ** 2 + (y - py) ** 2;
  const hitR2 = hitRadius ** 2;

  const candidates: Array<{ key: HandleKey; d2: number }> = [
    { key: "a", d2: dist2(handles.attack.x, handles.attack.y) },
    { key: "d", d2: dist2(handles.decay.x, handles.decay.y) },
    { key: "r", d2: dist2(handles.release.x, handles.release.y) },
  ];

  const hits = candidates.filter((h) => h.d2 <= hitR2);
  if (hits.length === 0) return null;

  hits.sort((a, b) => a.d2 - b.d2);
  return hits[0]!.key;
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

export function findClosestSegment(
  px: number,
  py: number,
  segments: ReturnType<typeof getEnvelopeSegmentPoints>,
  hitRadius: number
): "attack" | "decay" | "release" | null {
  const p = { x: px, y: py };
  const hitR2 = hitRadius ** 2;

  const bestAttack = minDistToPolyline(p, segments.attackPts);
  const bestDecay = minDistToPolyline(p, segments.decayPts);
  const bestRelease = minDistToPolyline(p, segments.releasePts);
  const best = Math.min(bestAttack, bestDecay, bestRelease);

  if (best > hitR2) return null;

  if (best === bestAttack) return "attack";
  if (best === bestDecay) return "decay";
  return "release";
}
