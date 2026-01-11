export function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function quantize(v: number, step: number): number {
  if (!Number.isFinite(v) || step <= 0) return v;
  return Math.round(v / step) * step;
}

export function clampPositive(v: number, fallback: number): number {
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return v;
}
