import type { EnvelopeEnv } from "@nodes/envelope/types";
import { clampShape } from "@utils/envelope";
import { clamp01 } from "@utils/math";
import type { HandleKey, SegmentKey } from "./types";
import { clampMs } from "./geometry";

export function constrainAttackHandle(env: EnvelopeEnv, nextMs: number): EnvelopeEnv {
  const attackMs = Math.min(clampMs(nextMs), env.attackMs + env.decayMs);
  return { ...env, attackMs };
}

export function constrainDecayHandle(
  env: EnvelopeEnv,
  nextMs: number,
  nextSustain: number
): EnvelopeEnv {
  const decayMs = Math.max(0, clampMs(nextMs) - env.attackMs);
  const sustain = clamp01(nextSustain);
  return { ...env, decayMs, sustain };
}

export function constrainReleaseHandle(env: EnvelopeEnv, nextMs: number): EnvelopeEnv {
  const releaseStart = env.attackMs + env.decayMs;
  const releaseMs = Math.max(0, clampMs(nextMs) - releaseStart);
  return { ...env, releaseMs };
}

export function applyHandleDrag(
  env: EnvelopeEnv,
  handle: HandleKey,
  nextMs: number,
  nextSustain: number
): EnvelopeEnv {
  switch (handle) {
    case "a":
      return constrainAttackHandle(env, nextMs);
    case "d":
      return constrainDecayHandle(env, nextMs, nextSustain);
    case "r":
      return constrainReleaseHandle(env, nextMs);
  }
}

export function applyShapeDrag(
  env: EnvelopeEnv,
  segment: SegmentKey,
  startShape: number,
  deltaY: number,
  dpr: number
): EnvelopeEnv {
  const sensitivity = 120 * dpr;
  const direction = segment === "attack" ? -1 : 1;
  const nextShape = clampShape(startShape + direction * (deltaY / sensitivity));

  switch (segment) {
    case "attack":
      return { ...env, attackShape: nextShape };
    case "decay":
      return { ...env, decayShape: nextShape };
    case "release":
      return { ...env, releaseShape: nextShape };
  }
}
