import { useEffect, useRef, useState } from "react";
import { phaseToMs, type EnvelopeTiming } from "@utils/envelope";
import type { EnvelopeEditorProps, HandleKey, SegmentKey, CurveDragState } from "./types";
import {
  HANDLE_BLEED_PX,
  getCanvasMetrics,
  createCoordinateSystem,
  getHandlePositions,
  getEnvelopeSegmentPoints,
  findClosestHandle,
  findClosestSegment,
} from "./geometry";
import { applyHandleDrag, applyShapeDrag } from "./handles";
import { drawEnvelope } from "./drawing";

export type { EnvelopeEditorProps } from "./types";

export function EnvelopeEditor({
  env,
  onChangeEnv,
  getRuntimeState,
  height = 86,
  onDragStart,
  onDragEnd,
}: EnvelopeEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeHandle, setActiveHandle] = useState<HandleKey | null>(null);
  const [activeSegment, setActiveSegment] = useState<SegmentKey | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const curveDragRef = useRef<CurveDragState | null>(null);

  const envRef = useRef(env);
  const activeHandleRef = useRef(activeHandle);
  envRef.current = env;
  activeHandleRef.current = activeHandle;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const draw = () => {
      const currentEnv = envRef.current;
      const { dpr, width, height } = getCanvasMetrics(canvas);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      const runtimeState = getRuntimeState?.();
      let playhead = null;

      if (runtimeState && runtimeState.phase !== "idle") {
        const timing: EnvelopeTiming = {
          attackSec: Math.max(0, currentEnv.attackMs) / 1000,
          decaySec: Math.max(0, currentEnv.decayMs) / 1000,
          releaseSec: Math.max(0, currentEnv.releaseMs) / 1000,
        };
        playhead = {
          ms: phaseToMs(runtimeState.phase, runtimeState.phaseProgress, timing),
          level: runtimeState.currentLevel,
        };
      }

      drawEnvelope(ctx, width, height, dpr, currentEnv, activeHandleRef.current, playhead);
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getRuntimeState]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
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

    const coords = createCoordinateSystem(canvas.width, canvas.height, dpr, env);
    const handles = getHandlePositions(env, coords);
    const hitRadius = 8 * dpr;

    const hitHandle = findClosestHandle(px, py, handles, hitRadius);

    if (hitHandle) {
      setActiveHandle(hitHandle);
      setActiveSegment(null);
      curveDragRef.current = null;
      onDragStart?.();
      return;
    }

    const segments = getEnvelopeSegmentPoints(env, coords, 40);
    const hitSegment = findClosestSegment(px, py, segments, 7 * dpr);

    if (hitSegment) {
      setActiveHandle(null);
      setActiveSegment(hitSegment);
      const startShape =
        hitSegment === "attack"
          ? env.attackShape
          : hitSegment === "decay"
          ? env.decayShape
          : env.releaseShape;
      curveDragRef.current = { segment: hitSegment, startY: py, startShape };
      onDragStart?.();
      return;
    }

    setActiveHandle(null);
    setActiveSegment(null);
    curveDragRef.current = null;
    activePointerIdRef.current = null;
    canvas.releasePointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (activePointerIdRef.current !== e.pointerId) return;

    const { rect, dpr, width, height } = getCanvasMetrics(canvas);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const px = (e.clientX - rect.left) * dpr;
    const py = (e.clientY - rect.top) * dpr;

    const coords = createCoordinateSystem(canvas.width, canvas.height, dpr, env);
    const nextMs = coords.msOfX(px);
    const nextSustain = coords.levelOfY(py);

    if (activeHandle) {
      onChangeEnv(applyHandleDrag(env, activeHandle, nextMs, nextSustain));
      return;
    }

    const drag = curveDragRef.current;
    if (drag && activeSegment) {
      const deltaY = py - drag.startY;
      onChangeEnv(applyShapeDrag(env, activeSegment, drag.startShape, deltaY, dpr));
    }
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLCanvasElement>) => {
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
  };

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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      />
    </div>
  );
}
