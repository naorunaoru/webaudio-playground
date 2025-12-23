import styles from "./App.module.css";
import { GraphEditor, type GraphEditorHandle } from "./graph/GraphEditor";
import { useEffect, useRef, useState } from "react";
import { getAudioEngine } from "./audio/engine";
import type { GraphState } from "./graph/types";

export function App() {
  const graphRef = useRef<GraphState | null>(null);
  const graphEditorRef = useRef<GraphEditorHandle | null>(null);
  const [audioState, setAudioState] = useState<AudioContextState | "off">(
    "off"
  );

  useEffect(() => {
    setAudioState(getAudioEngine().getStatus()?.state ?? "off");
  }, []);

  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        <section className={styles.panel}>
          <div className={styles.panelHeaderRow}>
            <h2 className={styles.panelTitle}>Graph</h2>
            <div className={styles.toolbar}>
              <select
                className={styles.toolbarSelect}
                value=""
                onChange={(e) => {
                  const type = e.target.value as
                    | "midiSource"
                    | "ccSource"
                    | "oscillator"
                    | "delay"
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
                <option value="delay">Delay</option>
                <option value="audioOut">Output</option>
              </select>
              <button
                type="button"
                className={styles.toolbarButton}
                onClick={async () => {
                  const engine = getAudioEngine();
                  const next = await engine.toggleRunning();
                  const snapshot = graphRef.current;
                  if (next === "running" && snapshot)
                    engine.syncGraph(snapshot);
                  setAudioState(next);
                }}
              >
                Audio: {audioState}
              </button>
            </div>
          </div>
          <GraphEditor
            ref={graphEditorRef}
            audioState={audioState}
            onGraphChange={(g) => {
              graphRef.current = g;
            }}
          />
        </section>
      </main>
    </div>
  );
}
