import { useEffect, useRef } from "react";
import type { EnvelopePhase } from "@nodes/envelope/types";
import type { CanvasMetrics, HandleIndex, SegmentIndex } from "./types";
import { drawEnvelopeUI, type MarkerDragVisual } from "./drawing";

export type UICanvasState = {
  phases: EnvelopePhase[];
  activeHandle: HandleIndex | null;
  selectedHandle: HandleIndex | null;
  markerDrag: MarkerDragVisual | null;
  handleReveal: number;
  hoveredSegment: SegmentIndex | null;
};

/**
 * Manages the UI canvas layer — handles, markers, hover indicators, drag visuals.
 * Redraws on demand via requestDraw(), drives handle radius animation.
 */
export function useUICanvas(
  metricsRef: React.RefObject<CanvasMetrics | null>,
  stateRef: React.RefObject<UICanvasState>,
  isHoveredRef: React.RefObject<boolean>,
  activePointerIdRef: React.RefObject<number | null>,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const needsDrawRef = useRef(true);
  const handleRadiusAnimRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  const drawFrame = (now: number) => {
    rafRef.current = 0;
    const dt = now - lastTimeRef.current;
    lastTimeRef.current = now;

    // Animate handle radius: 0 = collapsed, 1 = fully visible
    const target = isHoveredRef.current || activePointerIdRef.current != null ? 1 : 0;
    const speed = target === 1 ? 8 : 4;
    const prev = handleRadiusAnimRef.current;
    const next = prev + (target - prev) * Math.min(1, speed * dt / 1000);
    const animating = Math.abs(next - target) > 0.001;
    handleRadiusAnimRef.current = animating ? next : target;

    if (animating) {
      needsDrawRef.current = true;
    }

    if (!needsDrawRef.current) {
      // Still schedule next frame if animating
      if (animating) {
        rafRef.current = requestAnimationFrame(drawFrame);
      }
      return;
    }

    const canvas = canvasRef.current;
    const metrics = metricsRef.current;
    if (!canvas || !metrics) return;

    const { width, height, dpr } = metrics;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const state = stateRef.current!;

    drawEnvelopeUI(
      ctx,
      width,
      height,
      dpr,
      state.phases,
      state.activeHandle,
      state.selectedHandle,
      state.markerDrag,
      handleRadiusAnimRef.current,
      state.hoveredSegment,
    );

    needsDrawRef.current = false;

    if (animating) {
      rafRef.current = requestAnimationFrame(drawFrame);
    }
  };

  const requestDraw = () => {
    needsDrawRef.current = true;
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(drawFrame);
    }
  };

  useEffect(() => {
    requestDraw();
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, []);

  return { canvasRef, requestDraw };
}
