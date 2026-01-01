import { useEffect, useState } from "react";
import { getAudioEngine } from "../../audio/engine";
import {
  shallowEqualNumberRecord,
  shallowEqualRecordByValueRef,
} from "../shallowEqual";

export function useAudioLevels(audioState: AudioContextState | "off") {
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [debug, setDebug] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (audioState === "running") {
      const interval = window.setInterval(() => {
        const engine = getAudioEngine();
        const nextLevels = engine.getLevels();
        const nextDebug = engine.getDebug();
        setLevels((prev) =>
          shallowEqualNumberRecord(prev, nextLevels) ? prev : nextLevels
        );
        setDebug((prev) =>
          shallowEqualRecordByValueRef(prev, nextDebug) ? prev : nextDebug
        );
      }, 100);
      return () => window.clearInterval(interval);
    } else {
      setLevels({});
      setDebug({});
    }
  }, [audioState]);

  return { levels, debug };
}
