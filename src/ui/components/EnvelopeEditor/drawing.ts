import type { EnvelopeEnv } from "@nodes/envelope/types";
import type { HandleKey } from "./types";
import {
  createCoordinateSystem,
  getEnvelopeSegmentPoints,
  getHandlePositions,
} from "./geometry";

export type Playhead = {
  ms: number;
  level: number;
};

function drawGrid(
  ctx: CanvasRenderingContext2D,
  pad: number,
  w: number,
  h: number,
  dpr: number
) {
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
}

function drawCurve(
  ctx: CanvasRenderingContext2D,
  allPts: Array<{ x: number; y: number }>,
  dpr: number
) {
  ctx.strokeStyle = "rgba(236,239,244,0.9)";
  ctx.lineWidth = 1.75 * dpr;
  ctx.beginPath();
  ctx.moveTo(allPts[0]!.x, allPts[0]!.y);
  for (let i = 1; i < allPts.length; i++) {
    ctx.lineTo(allPts[i]!.x, allPts[i]!.y);
  }
  ctx.stroke();
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
  dpr: number
) {
  ctx.fillStyle = isActive ? "rgba(255,255,255,0.95)" : "rgba(236,239,244,0.75)";
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath();
  ctx.arc(x, y, (isActive ? 5 : 4) * dpr, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

export function drawEnvelope(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  env: EnvelopeEnv,
  activeHandle: HandleKey | null,
  playheads: Playhead[]
) {
  ctx.clearRect(0, 0, width, height);

  const coords = createCoordinateSystem(width, height, dpr, env);
  const { pad, w, h, totalMs, xOfMs } = coords;

  drawGrid(ctx, pad, w, h, dpr);

  const segments = getEnvelopeSegmentPoints(env, coords);
  const allPts = [
    ...segments.attackPts,
    ...segments.decayPts.slice(1),
    ...segments.releasePts.slice(1),
  ];
  drawCurve(ctx, allPts, dpr);

  // Draw all playheads with decreasing opacity for secondary voices
  for (let i = 0; i < playheads.length; i++) {
    const playhead = playheads[i];
    // First playhead is full opacity, others fade slightly
    const alpha = i === 0 ? 0.65 : Math.max(0.25, 0.5 - i * 0.05);
    drawPlayhead(ctx, playhead, totalMs, pad, h, xOfMs, dpr, alpha);
  }

  const handles = getHandlePositions(env, coords);
  drawHandle(ctx, handles.attack.x, handles.attack.y, activeHandle === "a", dpr);
  drawHandle(ctx, handles.decay.x, handles.decay.y, activeHandle === "d", dpr);
  drawHandle(ctx, handles.release.x, handles.release.y, activeHandle === "r", dpr);
}
