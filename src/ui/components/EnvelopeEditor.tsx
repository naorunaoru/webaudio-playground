import { useEffect, useMemo, useRef, useState } from "react";
import type { EnvelopeEnv } from "../../nodes/envelope/types";

type HandleKey = "a" | "d" | "r";
type SegmentKey = "attack" | "decay" | "release";

const HANDLE_BLEED_PX = 8;

export type EnvelopeEditorProps = Readonly<{
  env: EnvelopeEnv;
  onChangeEnv: (next: EnvelopeEnv) => void;
  /** Milliseconds timestamp (from `performance.now()`) when the envelope was triggered. */
  noteOnAtMs?: number | null;
  /** Milliseconds timestamp (from `performance.now()`) when the envelope was released. */
  noteOffAtMs?: number | null;
  holdMs?: number;
  height?: number;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}>;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clampMs(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(5000, v));
}

function clampShape(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-1, Math.min(1, v));
}

function gammaForShape(shape: number): number {
  return Math.pow(2, clampShape(shape) * 4);
}

function shapedUFromT(t: number, shape: number): number {
  const tt = clamp01(t);
  const g = gammaForShape(shape);
  if (g === 1) return tt;
  // Ease-in power curve:
  // - g > 1 => slower at start (exp-ish), faster at end
  // - g < 1 => faster at start (log-ish), slower at end
  return Math.pow(tt, g);
}

function invTFromU(u: number, shape: number): number {
  const uu = clamp01(u);
  const g = gammaForShape(shape);
  if (g === 1) return uu;
  return Math.pow(uu, 1 / g);
}

function levelAtMs(ms: number, env: EnvelopeEnv, holdMs: number): number {
  const a = Math.max(0, env.attackMs);
  const d = Math.max(0, env.decayMs);
  const r = Math.max(0, env.releaseMs);

  const tA = a;
  const tD = a + d;
  const tS = a + d + holdMs;
  const tR = a + d + holdMs + r;

  if (ms <= 0) return 0;
  if (ms < tA) {
    const t = ms / Math.max(1, a);
    return shapedUFromT(t, env.attackShape);
  }
  if (ms < tD) {
    const t = (ms - tA) / Math.max(1, d);
    const u = shapedUFromT(t, env.decayShape);
    return 1 + (clamp01(env.sustain) - 1) * u;
  }
  if (ms < tS) return clamp01(env.sustain);
  if (ms < tR) {
    const t = (ms - tS) / Math.max(1, r);
    const u = shapedUFromT(t, env.releaseShape);
    return clamp01(env.sustain) * (1 - u);
  }
  return 0;
}

function levelAfterRelease(
  playheadMs: number,
  env: EnvelopeEnv,
  holdMs: number,
  releaseStartMs: number,
  releaseMs: number
): number {
  if (playheadMs <= releaseStartMs) return levelAtMs(playheadMs, env, holdMs);
  if (releaseMs <= 0) return 0;
  const startLevel = levelAtMs(releaseStartMs, env, holdMs);
  const t = (playheadMs - releaseStartMs) / releaseMs;
  const u = shapedUFromT(t, env.releaseShape);
  return startLevel * (1 - u);
}

function segmentPoints(
  ms0: number,
  ms1: number,
  level0: number,
  level1: number,
  shape: number,
  xOfMs: (ms: number) => number,
  yOfLevel: (level: number) => number,
  samples = 96
) {
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

function drawEnvelope(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  env: EnvelopeEnv,
  activeHandle: HandleKey | null,
  playhead: { ms: number; level: number } | null
) {
  ctx.clearRect(0, 0, width, height);

  const pad = HANDLE_BLEED_PX * dpr;
  const w = width - pad * 2;
  const h = height - pad * 2;

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1 * dpr;
  ctx.beginPath();
  for (let i = 0; i <= 4; i++) {
    const x = pad + (w * i) / 4;
    ctx.moveTo(x, pad);
    ctx.lineTo(x, pad + h);
  }
  for (let i = 0; i <= 2; i++) {
    const y = pad + (h * i) / 2;
    ctx.moveTo(pad, y);
    ctx.lineTo(pad + w, y);
  }
  ctx.stroke();

  const totalMs = Math.max(1, env.attackMs + env.decayMs + env.releaseMs);
  const xOfMs = (ms: number) => pad + (ms / totalMs) * w;
  const yOfLevel = (level: number) => pad + (1 - clamp01(level)) * h;

  const x0 = xOfMs(0);
  const y0 = yOfLevel(0);
  const xa = xOfMs(env.attackMs);
  const ya = yOfLevel(1);
  const xd = xOfMs(env.attackMs + env.decayMs);
  const yd = yOfLevel(env.sustain);
  const xr = xOfMs(env.attackMs + env.decayMs + env.releaseMs);
  const yr = yOfLevel(0);

  ctx.strokeStyle = "rgba(236,239,244,0.9)";
  ctx.lineWidth = 1.75 * dpr;
  ctx.beginPath();
  const attackPts = segmentPoints(
    0,
    env.attackMs,
    0,
    1,
    env.attackShape,
    xOfMs,
    yOfLevel,
    64
  );
  const decayPts = segmentPoints(
    env.attackMs,
    env.attackMs + env.decayMs,
    1,
    env.sustain,
    env.decayShape,
    xOfMs,
    yOfLevel,
    64
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
    64
  );

  const allPts = [...attackPts, ...decayPts.slice(1), ...releasePts.slice(1)];

  ctx.moveTo(allPts[0]!.x, allPts[0]!.y);
  for (let i = 1; i < allPts.length; i++)
    ctx.lineTo(allPts[i]!.x, allPts[i]!.y);
  ctx.stroke();

  if (playhead != null) {
    const clamped = Math.max(0, Math.min(totalMs, playhead.ms));
    const x = xOfMs(clamped);
    const y = yOfLevel(clamp01(playhead.level));

    ctx.strokeStyle = "rgba(236,72,153,0.65)";
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(x, pad);
    ctx.lineTo(x, pad + h);
    ctx.stroke();
  }

  const handle = (x: number, y: number, key: HandleKey) => {
    const isActive = activeHandle === key;
    ctx.fillStyle = isActive
      ? "rgba(255,255,255,0.95)"
      : "rgba(236,239,244,0.75)";
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.arc(x, y, (isActive ? 5 : 4) * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };

  handle(xa, ya, "a");
  handle(xd, yd, "d");
  handle(xr, yr, "r");
}

function getCanvasMetrics(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  return { rect, dpr, width, height };
}

export function EnvelopeEditor({
  env,
  onChangeEnv,
  noteOnAtMs = null,
  noteOffAtMs = null,
  holdMs = 240,
  height = 86,
  onDragStart,
  onDragEnd,
}: EnvelopeEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeHandle, setActiveHandle] = useState<HandleKey | null>(null);
  const [activeSegment, setActiveSegment] = useState<SegmentKey | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const curveDragRef = useRef<{
    segment: SegmentKey;
    startY: number;
    startShape: number;
  } | null>(null);

  const [nowMs, setNowMs] = useState(() => performance.now());

  const [visualOnAtMs, setVisualOnAtMs] = useState<number | null>(noteOnAtMs);
  const [visualOffAtMs, setVisualOffAtMs] = useState<number | null>(noteOffAtMs);
  const visualTimesRef = useRef<{ on: number | null; off: number | null }>({
    on: noteOnAtMs,
    off: noteOffAtMs,
  });
  const prevEnvRef = useRef(env);

  useEffect(() => {
    setVisualOnAtMs(noteOnAtMs);
    setVisualOffAtMs(noteOffAtMs);
    visualTimesRef.current = { on: noteOnAtMs, off: noteOffAtMs };
    prevEnvRef.current = env;
    setNowMs(performance.now());
  }, [noteOnAtMs]);

  useEffect(() => {
    setVisualOffAtMs(noteOffAtMs);
    visualTimesRef.current = { ...visualTimesRef.current, off: noteOffAtMs };
    setNowMs(performance.now());
  }, [noteOffAtMs]);

  const totalMs = (e: EnvelopeEnv) => Math.max(1, e.attackMs + e.decayMs + e.releaseMs);
  const sustainEndMs = (e: EnvelopeEnv) => Math.max(0, e.attackMs) + Math.max(0, e.decayMs);
  const computePlayheadMs = (
    now: number,
    e: EnvelopeEnv,
    onAt: number | null,
    offAt: number | null,
  ): number | null => {
    if (onAt == null) return null;
    const on = onAt;
    const off = offAt != null && offAt >= on ? offAt : null;
    const sustainEnd = sustainEndMs(e);
    if (off == null) return Math.min(Math.max(0, now - on), sustainEnd);

    const offDelta = Math.max(0, off - on);
    const releaseStart = Math.min(offDelta, sustainEnd);
    const releaseElapsed = Math.max(0, now - off);
    return releaseStart + Math.min(releaseElapsed, Math.max(0, e.releaseMs));
  };

  useEffect(() => {
    const prevEnv = prevEnvRef.current;
    prevEnvRef.current = env;

    const { on, off } = visualTimesRef.current;
    if (on == null) {
      setNowMs(performance.now());
      return;
    }

    const now = performance.now();
    const oldTotal = totalMs(prevEnv);
    const newTotal = totalMs(env);
    const oldPlayhead = computePlayheadMs(now, prevEnv, on, off);
    if (oldPlayhead == null) {
      setNowMs(now);
      return;
    }

    const x01 = Math.max(0, Math.min(1, oldPlayhead / oldTotal));
    const desired = x01 * newTotal;

    const newSustainEnd = sustainEndMs(env);

    if (off == null || off < on) {
      const clamped = Math.min(Math.max(0, desired), newSustainEnd);
      const nextOn = now - clamped;
      visualTimesRef.current = { on: nextOn, off: null };
      setVisualOnAtMs(nextOn);
      setVisualOffAtMs(null);
      setNowMs(now);
      return;
    }

    const offDelta = Math.max(0, off - on);
    const releaseStart = Math.min(offDelta, newSustainEnd);
    const desiredReleaseElapsed = desired - releaseStart;
    const clampedReleaseElapsed = Math.max(0, Math.min(env.releaseMs, desiredReleaseElapsed));

    const nextOff = now - clampedReleaseElapsed;
    const nextOn = nextOff - offDelta;
    visualTimesRef.current = { on: nextOn, off: nextOff };
    setVisualOnAtMs(nextOn);
    setVisualOffAtMs(nextOff);
    setNowMs(now);
  }, [env.attackMs, env.decayMs, env.releaseMs]);
  useEffect(() => {
    if (visualOnAtMs == null) return;
    const startOn = visualOnAtMs;

    let raf = 0;
    const tick = () => {
      const now = performance.now();
      setNowMs(now);
      const sustainEnd = Math.max(0, env.attackMs) + Math.max(0, env.decayMs);
      if (visualOffAtMs == null || visualOffAtMs < startOn) {
        if (now - startOn < sustainEnd) raf = requestAnimationFrame(tick);
      } else {
        const releaseMs = Math.max(0, env.releaseMs);
        if (now - visualOffAtMs < releaseMs) raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    visualOnAtMs,
    visualOffAtMs,
    env.attackMs,
    env.decayMs,
    env.releaseMs,
    holdMs,
  ]);

  const playhead = useMemo(() => {
    if (visualOnAtMs == null) return null;
    const sustainEndMs = Math.max(0, env.attackMs) + Math.max(0, env.decayMs);
    const now = nowMs;

    if (visualOffAtMs == null || visualOffAtMs < visualOnAtMs) {
      const ms = Math.min(Math.max(0, now - visualOnAtMs), sustainEndMs);
      return { ms, level: levelAtMs(ms, env, holdMs) };
    }

    const releaseStartMs = Math.min(
      Math.max(0, visualOffAtMs - visualOnAtMs),
      sustainEndMs
    );
    const releaseElapsedMs = Math.max(0, now - visualOffAtMs);
    const releaseMs = Math.max(0, env.releaseMs);
    const ms = releaseStartMs + Math.min(releaseElapsedMs, releaseMs);
    return {
      ms,
      level: levelAfterRelease(ms, env, holdMs, releaseStartMs, releaseMs),
    };
  }, [env, holdMs, visualOnAtMs, visualOffAtMs, nowMs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { dpr, width, height } = getCanvasMetrics(canvas);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    drawEnvelope(ctx, width, height, dpr, env, activeHandle, playhead);
  }, [env, activeHandle, holdMs, playhead]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(0,0,0,0.18)",
        overflow: "visible",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          left: -HANDLE_BLEED_PX,
          top: -HANDLE_BLEED_PX,
          width: `calc(100% + ${HANDLE_BLEED_PX * 2}px)`,
          height: height + HANDLE_BLEED_PX * 2,
          touchAction: "none",
        }}
        onPointerDown={(e) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (activePointerIdRef.current != null) return;
        activePointerIdRef.current = e.pointerId;
        canvas.setPointerCapture(e.pointerId);

        const { rect, dpr, width, height } = getCanvasMetrics(canvas);
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        const px = (e.clientX - rect.left) * dpr;
        const py = (e.clientY - rect.top) * dpr;

        const pad = HANDLE_BLEED_PX * dpr;
        const w = canvas.width - pad * 2;
        const h = canvas.height - pad * 2;
        const totalMs = Math.max(1, env.attackMs + env.decayMs + env.releaseMs);
        const xOfMs = (ms: number) => pad + (ms / totalMs) * w;
        const yOfLevel = (level: number) => pad + (1 - clamp01(level)) * h;

        const xa = xOfMs(env.attackMs);
        const ya = yOfLevel(1);
        const xd = xOfMs(env.attackMs + env.decayMs);
        const yd = yOfLevel(env.sustain);
        const xr = xOfMs(env.attackMs + env.decayMs + env.releaseMs);
        const yr = yOfLevel(0);

        const dist2 = (x1: number, y1: number) =>
          (x1 - px) ** 2 + (y1 - py) ** 2;
        const hitR = (8 * dpr) ** 2;
        const candidates: Array<{ key: HandleKey; d2: number }> = [
          { key: "a", d2: dist2(xa, ya) },
          { key: "d", d2: dist2(xd, yd) },
          { key: "r", d2: dist2(xr, yr) },
        ];
        const hits = candidates.filter((h) => h.d2 <= hitR);

        if (hits.length === 0) {
          const attackPts = segmentPoints(
            0,
            env.attackMs,
            0,
            1,
            env.attackShape,
            xOfMs,
            yOfLevel,
            40
          );
          const decayPts = segmentPoints(
            env.attackMs,
            env.attackMs + env.decayMs,
            1,
            env.sustain,
            env.decayShape,
            xOfMs,
            yOfLevel,
            40
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
            40
          );

          const dist2PointToSeg = (
            p: { x: number; y: number },
            a: { x: number; y: number },
            b: { x: number; y: number }
          ) => {
            const abx = b.x - a.x;
            const aby = b.y - a.y;
            const apx = p.x - a.x;
            const apy = p.y - a.y;
            const abLen2 = abx * abx + aby * aby;
            const t =
              abLen2 === 0
                ? 0
                : Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLen2));
            const cx = a.x + abx * t;
            const cy = a.y + aby * t;
            return (p.x - cx) ** 2 + (p.y - cy) ** 2;
          };

          const p = { x: px, y: py };
          const hitSegR2 = (7 * dpr) ** 2;
          const pick = (pts: Array<{ x: number; y: number }>) => {
            let best = Infinity;
            for (let i = 0; i < pts.length - 1; i++)
              best = Math.min(best, dist2PointToSeg(p, pts[i]!, pts[i + 1]!));
            return best;
          };

          const bestAttack = pick(attackPts);
          const bestDecay = pick(decayPts);
          const bestRelease = pick(releasePts);
          const best = Math.min(bestAttack, bestDecay, bestRelease);

          if (best <= hitSegR2) {
            const segment: SegmentKey =
              best === bestAttack
                ? "attack"
                : best === bestDecay
                ? "decay"
                : "release";
            setActiveHandle(null);
            setActiveSegment(segment);
            const startShape =
              segment === "attack"
                ? env.attackShape
                : segment === "decay"
                ? env.decayShape
                : env.releaseShape;
            curveDragRef.current = { segment, startY: py, startShape };
            onDragStart?.();
            return;
          }

          setActiveHandle(null);
          setActiveSegment(null);
          curveDragRef.current = null;
          activePointerIdRef.current = null;
          canvas.releasePointerCapture(e.pointerId);
          return;
        }

        hits.sort((a, b) => a.d2 - b.d2);
        setActiveHandle(hits[0]!.key);
        setActiveSegment(null);
        curveDragRef.current = null;
        onDragStart?.();
      }}
      onPointerMove={(e) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (activePointerIdRef.current !== e.pointerId) return;

        const { rect, dpr, width, height } = getCanvasMetrics(canvas);
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        const px = (e.clientX - rect.left) * dpr;
        const py = (e.clientY - rect.top) * dpr;

        const pad = HANDLE_BLEED_PX * dpr;
        const w = canvas.width - pad * 2;
        const h = canvas.height - pad * 2;
        const totalMs = Math.max(1, env.attackMs + env.decayMs + env.releaseMs);
        const msOfX = (x: number) => ((x - pad) / w) * totalMs;
        const levelOfY = (y: number) => clamp01(1 - (y - pad) / h);

        const nextMs = clampMs(msOfX(px));
        const nextSustain = clamp01(levelOfY(py));

        if (activeHandle) {
          if (activeHandle === "a") {
            const a = Math.min(nextMs, env.attackMs + env.decayMs);
            onChangeEnv({ ...env, attackMs: a });
          } else if (activeHandle === "d") {
            const d = Math.max(0, nextMs - env.attackMs);
            onChangeEnv({ ...env, decayMs: d, sustain: nextSustain });
          } else if (activeHandle === "r") {
            const releaseStart = env.attackMs + env.decayMs;
            const r = Math.max(0, nextMs - releaseStart);
            onChangeEnv({ ...env, releaseMs: r });
          }
          return;
        }

        const drag = curveDragRef.current;
        if (!drag || activeSegment == null) return;
        const deltaY = py - drag.startY;
        const nextShape = clampShape(
          drag.startShape +
            (activeSegment === "attack" ? 1 : -1) * (deltaY / (120 * dpr)),
        );
        if (activeSegment === "attack")
          onChangeEnv({ ...env, attackShape: nextShape });
        else if (activeSegment === "decay")
          onChangeEnv({ ...env, decayShape: nextShape });
        else onChangeEnv({ ...env, releaseShape: nextShape });
      }}
      onPointerUp={(e) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (activePointerIdRef.current !== e.pointerId) return;
        const wasDragging = activeHandle != null || activeSegment != null;
        activePointerIdRef.current = null;
        setActiveHandle(null);
        setActiveSegment(null);
        curveDragRef.current = null;
        canvas.releasePointerCapture(e.pointerId);
        if (wasDragging) onDragEnd?.();
      }}
      onPointerCancel={(e) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (activePointerIdRef.current !== e.pointerId) return;
        const wasDragging = activeHandle != null || activeSegment != null;
        activePointerIdRef.current = null;
        setActiveHandle(null);
        setActiveSegment(null);
        curveDragRef.current = null;
        canvas.releasePointerCapture(e.pointerId);
        if (wasDragging) onDragEnd?.();
      }}
      />
    </div>
  );
}
