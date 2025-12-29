import styles from "./App.module.css";
import { GraphEditor, type GraphEditorHandle } from "./graph/GraphEditor";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAudioEngine } from "./audio/engine";
import type { GraphState } from "./graph/types";

function readAudioDspLoad(engineDebug: Record<string, unknown>): number | null {
  let max = 0;
  let any = false;
  for (const v of Object.values(engineDebug)) {
    if (!v || typeof v !== "object") continue;
    const cpuLoad = (v as any).cpuLoad;
    if (typeof cpuLoad !== "number" || !Number.isFinite(cpuLoad)) continue;
    max = Math.max(max, cpuLoad);
    any = true;
  }
  return any ? max : null;
}

export function App() {
  const graphRef = useRef<GraphState | null>(null);
  const graphEditorRef = useRef<GraphEditorHandle | null>(null);
  const didAutoStartRef = useRef(false);
  const [audioState, setAudioState] = useState<AudioContextState | "off">(
    "off"
  );
  const [dspLoad, setDspLoad] = useState<number | null>(null);

  const ensureAudioRunning = useCallback(async (graph: GraphState | null) => {
    const engine = getAudioEngine();
    await engine.ensureRunning();
    if (graph) engine.syncGraph(graph);
    setAudioState(engine.getStatus()?.state ?? "off");
  }, []);

  useEffect(() => {
    setAudioState(getAudioEngine().getStatus()?.state ?? "off");
  }, []);

  useEffect(() => {
    const onFirstInteraction = (evt: Event) => {
      const target = evt.target;
      if (target instanceof Element && target.closest("[data-audio-toggle]")) {
        return;
      }
      if (didAutoStartRef.current) return;
      didAutoStartRef.current = true;
      const snapshot = graphEditorRef.current?.getGraph() ?? graphRef.current;
      void ensureAudioRunning(snapshot ?? null);
    };

    const pointerOptions: AddEventListenerOptions = {
      capture: true,
      passive: true,
    };
    const keyOptions: AddEventListenerOptions = { capture: true };
    window.addEventListener("pointerdown", onFirstInteraction, pointerOptions);
    window.addEventListener("keydown", onFirstInteraction, keyOptions);
    return () => {
      window.removeEventListener("pointerdown", onFirstInteraction, pointerOptions);
      window.removeEventListener("keydown", onFirstInteraction, keyOptions);
    };
  }, [ensureAudioRunning]);

  useEffect(() => {
    if (audioState === "running") {
      const interval = window.setInterval(() => {
        const engine = getAudioEngine();
        setDspLoad(readAudioDspLoad(engine.getDebug()));
      }, 100);
      return () => window.clearInterval(interval);
    } else {
      setDspLoad(null);
    }
  }, [audioState]);

  return (
    <div className={styles.shell}>
      <GraphEditor
        ref={graphEditorRef}
        audioState={audioState}
        onEnsureAudioRunning={ensureAudioRunning}
        onGraphChange={(g) => {
          graphRef.current = g;
        }}
      />

      <div className={styles.topBar}>
        <div className={styles.topBarTitle}>webaudio-playground</div>
        <div className={styles.topBarControls}>
          <select
            className={styles.toolbarSelect}
            value=""
            onChange={(e) => {
              const type = e.target.value as
                | "midiSource"
                | "ccSource"
                | "oscillator"
                | "envelope"
                | "gain"
                | "delay"
                | "reverb"
                | "limiter"
                | "samplePlayer"
                | "audioOut"
                | "";
              if (!type) return;
              graphEditorRef.current?.addNode(type);
            }}
          >
            <option value="" disabled>
              Add node…
            </option>
            <option value="midiSource">MIDI Source</option>
            <option value="ccSource">CC Source</option>
            <option value="oscillator">Oscillator</option>
            <option value="envelope">Envelope</option>
            <option value="gain">Gain</option>
            <option value="delay">Delay</option>
            <option value="reverb">Reverb</option>
            <option value="limiter">Limiter</option>
            <option value="samplePlayer">Sample Player</option>
            <option value="audioOut">Output</option>
          </select>
          <div
            className={styles.toolbarStat}
            title="Approximate audio DSP load from custom AudioWorklet processors (not total system CPU)."
          >
            DSP:{" "}
            <span className={styles.toolbarStatValue}>
              {dspLoad == null ? "—" : `${Math.round(dspLoad * 100)}%`}
            </span>
          </div>
          <button
            type="button"
            className={styles.toolbarButton}
            data-audio-toggle
            onClick={async () => {
              const engine = getAudioEngine();
              const next = await engine.toggleRunning();
              const snapshot = graphRef.current;
              if (next === "running" && snapshot) engine.syncGraph(snapshot);
              setAudioState(next);
            }}
          >
            Audio: {audioState}
          </button>
        </div>
      </div>
    </div>
  );
}
