import { useEffect, useState } from "react";
import { getAudioEngine } from "../../audio/engine";
import { shallowEqualRecordByValueRef } from "../shallowEqual";

/**
 * Hook for polling runtime state from the audio engine.
 * Note: Audio levels are no longer tracked here - they are read directly
 * by NodeMeter components using requestAnimationFrame for smooth updates
 * without React re-renders.
 */
export function useAudioLevels(audioState: AudioContextState | "off") {
  const [runtimeState, setRuntimeState] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (audioState === "running") {
      const interval = window.setInterval(() => {
        const engine = getAudioEngine();
        const nextRuntimeState = engine.getRuntimeState();
        setRuntimeState((prev) =>
          shallowEqualRecordByValueRef(prev, nextRuntimeState)
            ? prev
            : nextRuntimeState
        );
      }, 100);
      return () => window.clearInterval(interval);
    } else {
      setRuntimeState({});
    }
  }, [audioState]);

  return { runtimeState };
}
