import { useEffect, useRef } from "react";
import type { EnvelopePhase } from "@nodes/envelope/types";
import type { CanvasMetrics } from "./types";
import { drawEnvelopeShape } from "./drawing";

/**
 * Manages the shape canvas layer — grid, loop region, envelope curve.
 * Redraws only when phases change or canvas resizes.
 */
export function useShapeCanvas(
  phases: EnvelopePhase[],
  metricsRef: React.RefObject<CanvasMetrics | null>,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawnPhasesRef = useRef<EnvelopePhase[] | null>(null);
  const drawnMetricsRef = useRef<CanvasMetrics | null>(null);

  const draw = () => {
    const canvas = canvasRef.current;
    const metrics = metricsRef.current;
    if (!canvas || !metrics) return;

    // Skip if nothing changed
    if (drawnPhasesRef.current === phases && drawnMetricsRef.current === metrics) return;
    drawnPhasesRef.current = phases;
    drawnMetricsRef.current = metrics;

    const { width, height, dpr } = metrics;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawEnvelopeShape(ctx, width, height, dpr, phases);
  };

  // Redraw when phases change (triggered by re-render)
  useEffect(() => {
    draw();
  });

  return { canvasRef, redraw: draw };
}
