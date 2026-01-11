import { useCallback } from "react";
import { getAudioEngine } from "../../audio/engine";

/**
 * Hook that returns a stable getter function for reading a node's runtime state on-demand.
 *
 * Unlike a push-based approach with fixed polling intervals, this lets each component
 * decide when and how often to read state - whether that's in a requestAnimationFrame
 * loop for smooth 60fps animation, or in a slower interval for less time-sensitive updates.
 *
 * @example
 * // In a component with its own rAF loop:
 * const getRuntimeState = useRuntimeStateGetter<EnvelopeRuntimeState>(nodeId);
 *
 * useEffect(() => {
 *   let raf = 0;
 *   const tick = () => {
 *     const state = getRuntimeState();
 *     // use state for rendering...
 *     raf = requestAnimationFrame(tick);
 *   };
 *   raf = requestAnimationFrame(tick);
 *   return () => cancelAnimationFrame(raf);
 * }, [getRuntimeState]);
 */
export function useRuntimeStateGetter<T = unknown>(
  nodeId: string
): () => T | undefined {
  return useCallback(() => {
    const allState = getAudioEngine().getRuntimeState();
    return allState[nodeId] as T | undefined;
  }, [nodeId]);
}
