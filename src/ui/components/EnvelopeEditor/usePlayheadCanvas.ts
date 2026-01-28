import { useEffect, useRef } from "react";
import type { EnvelopePhase } from "@nodes/envelope/types";
import type { CanvasMetrics } from "./types";
import { drawEnvelopePlayheads, type Playhead } from "./drawing";
import { phaseIndexToMs } from "./geometry";

type GetRuntimeState = () =>
  | {
      voices?: Array<{
        phaseIndex: number;
        phaseProgress: number;
        currentLevel: number;
      }>;
    }
  | undefined;

const MAX_PLAYHEADS = 32;

/**
 * Manages the playhead canvas layer — continuous rAF loop polling runtime state.
 * Only draws when voices are active.
 */
export function usePlayheadCanvas(
  phasesRef: React.RefObject<EnvelopePhase[]>,
  metricsRef: React.RefObject<CanvasMetrics | null>,
  getRuntimeState: GetRuntimeState | undefined,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Pre-allocate playhead pool to avoid per-frame allocations
    const playheadPool: Playhead[] = [];
    for (let i = 0; i < MAX_PLAYHEADS; i++) {
      playheadPool.push({ ms: 0, level: 0 });
    }

    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);

      const canvas = canvasRef.current;
      const metrics = metricsRef.current;
      if (!canvas || !metrics) return;

      const { width, height, dpr } = metrics;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const phases = phasesRef.current!;
      const runtimeState = getRuntimeState?.();
      let count = 0;

      if (runtimeState && runtimeState.voices) {
        const voices = runtimeState.voices;
        for (let i = 0; i < voices.length && count < MAX_PLAYHEADS; i++) {
          const voice = voices[i]!;
          if (voice.phaseIndex >= 0 || voice.currentLevel > 0) {
            const ph = playheadPool[count]!;
            ph.ms = phaseIndexToMs(
              phases,
              voice.phaseIndex,
              voice.phaseProgress,
            );
            ph.level = voice.currentLevel;
            count++;
          }
        }
      }

      drawEnvelopePlayheads(
        ctx,
        width,
        height,
        dpr,
        phases,
        playheadPool,
        count,
      );
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getRuntimeState]);

  return { canvasRef };
}
