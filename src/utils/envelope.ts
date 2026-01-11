import { clamp01 } from "./math";

export function clampShape(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-1, Math.min(1, v));
}

export function shapedT(t: number, shape: number): number {
  const tt = Math.max(0, Math.min(1, t));
  const s = clampShape(shape);

  // Linear case
  if (Math.abs(s) < 0.001) return tt;

  // Map shape to curvature parameter (RC time constant factor)
  // Higher absolute values = more extreme curves
  const k = s * 5;

  if (k > 0) {
    // Exponential ease-out: fast start, slow finish (like capacitor charging)
    // Normalized to span exactly [0, 1]
    return (1 - Math.exp(-tt * k)) / (1 - Math.exp(-k));
  } else {
    // Exponential ease-in: slow start, fast finish
    // f(t) = (e^(t*k) - 1) / (e^k - 1)  where k = |shape| * 5
    const kAbs = -k;
    return (Math.exp(tt * kAbs) - 1) / (Math.exp(kAbs) - 1);
  }
}

export function invTFromU(u: number, shape: number): number {
  const uu = clamp01(u);
  const s = clampShape(shape);

  // Linear case
  if (Math.abs(s) < 0.001) return uu;

  // Map shape to curvature parameter (RC time constant factor)
  const k = s * 5;

  if (k > 0) {
    // Inverse of: (1 - exp(-t*k)) / (1 - exp(-k))
    const denom = 1 - Math.exp(-k);
    return -Math.log(1 - uu * denom) / k;
  } else {
    // Inverse of: (e^(t*k) - 1) / (e^k - 1)
    const kAbs = -k;
    return Math.log(uu * (Math.exp(kAbs) - 1) + 1) / kAbs;
  }
}

export type EnvelopePhase = "idle" | "attack" | "decay" | "sustain" | "release";

export type EnvelopeTiming = {
  attackSec: number;
  decaySec: number;
  releaseSec: number;
};

export function getPhaseAtTime(
  elapsedSec: number,
  timing: EnvelopeTiming,
  isReleased: boolean
): { phase: EnvelopePhase; progress: number } {
  const { attackSec, decaySec, releaseSec } = timing;

  if (isReleased) {
    if (releaseSec <= 0 || elapsedSec >= releaseSec) {
      return { phase: "idle", progress: 0 };
    }
    return { phase: "release", progress: clamp01(elapsedSec / releaseSec) };
  }

  if (elapsedSec < attackSec) {
    return {
      phase: "attack",
      progress: attackSec > 0 ? clamp01(elapsedSec / attackSec) : 1,
    };
  }

  if (elapsedSec < attackSec + decaySec) {
    return {
      phase: "decay",
      progress: decaySec > 0 ? clamp01((elapsedSec - attackSec) / decaySec) : 1,
    };
  }

  return { phase: "sustain", progress: 1 };
}

export function phaseToMs(
  phase: EnvelopePhase,
  progress: number,
  timing: EnvelopeTiming
): number {
  const { attackSec, decaySec, releaseSec } = timing;
  const toMs = (sec: number) => sec * 1000;

  switch (phase) {
    case "attack":
      return toMs(attackSec * progress);
    case "decay":
      return toMs(attackSec + decaySec * progress);
    case "sustain":
      return toMs(attackSec + decaySec);
    case "release":
      return toMs(attackSec + decaySec + releaseSec * progress);
    case "idle":
    default:
      return 0;
  }
}
