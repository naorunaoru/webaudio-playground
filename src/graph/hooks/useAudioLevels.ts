import { useEffect, useState } from "react";
import { getAudioEngine } from "../../audio/engine";
import {
  shallowEqualNumberRecord,
  shallowEqualRecordByValueRef,
} from "../shallowEqual";

export function useAudioLevels(audioState: AudioContextState | "off") {
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [runtimeState, setRuntimeState] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (audioState === "running") {
      const interval = window.setInterval(() => {
        const engine = getAudioEngine();
        const nextLevels = engine.getLevels();
        const nextRuntimeState = engine.getRuntimeState();
        setLevels((prev) =>
          shallowEqualNumberRecord(prev, nextLevels) ? prev : nextLevels
        );
        setRuntimeState((prev) =>
          shallowEqualRecordByValueRef(prev, nextRuntimeState)
            ? prev
            : nextRuntimeState
        );
      }, 100);
      return () => window.clearInterval(interval);
    } else {
      setLevels({});
      setRuntimeState({});
    }
  }, [audioState]);

  return { levels, runtimeState };
}
