import styles from "./App.module.css";
import { GraphEditor, type GraphEditorHandle } from "./graph/GraphEditor";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAudioEngine } from "./audio/engine";
import type { GraphState, GraphNode } from "./graph/types";
import {
  exportProject,
  downloadBlob,
  importProject,
  pickFile,
} from "./project";
import { GraphDocProvider, useGraphDoc } from "./state";
import { createNode } from "./graph/graphUtils";

function readAudioDspLoad(
  engineRuntimeState: Record<string, unknown>
): number | null {
  let max = 0;
  let any = false;
  for (const v of Object.values(engineRuntimeState)) {
    if (!v || typeof v !== "object") continue;
    const cpuLoad = (v as any).cpuLoad;
    if (typeof cpuLoad !== "number" || !Number.isFinite(cpuLoad)) continue;
    max = Math.max(max, cpuLoad);
    any = true;
  }
  return any ? max : null;
}

function AppContent() {
  const {
    graphState,
    isLoading,
    addNode,
    newDocument,
    importDocument,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useGraphDoc();

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
      void ensureAudioRunning(graphState);
    };

    const pointerOptions: AddEventListenerOptions = {
      capture: true,
      passive: true,
    };
    const keyOptions: AddEventListenerOptions = { capture: true };
    window.addEventListener("pointerdown", onFirstInteraction, pointerOptions);
    window.addEventListener("keydown", onFirstInteraction, keyOptions);
    return () => {
      window.removeEventListener(
        "pointerdown",
        onFirstInteraction,
        pointerOptions
      );
      window.removeEventListener("keydown", onFirstInteraction, keyOptions);
    };
  }, [ensureAudioRunning, graphState]);

  useEffect(() => {
    if (audioState === "running") {
      const interval = window.setInterval(() => {
        const engine = getAudioEngine();
        setDspLoad(readAudioDspLoad(engine.getRuntimeState()));
      }, 100);
      return () => window.clearInterval(interval);
    } else {
      setDspLoad(null);
    }
  }, [audioState]);

  const handleExport = useCallback(async () => {
    if (!graphState) return;

    try {
      const blob = await exportProject(graphState);
      const timestamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `webaudio-project-${timestamp}.zip`);
    } catch (err) {
      console.error("Export failed:", err);
    }
  }, [graphState]);

  const handleImport = useCallback(async () => {
    const file = await pickFile(".zip");
    if (!file) return;

    const result = await importProject(file);

    if (!result.success) {
      alert(`Import failed: ${result.error}`);
      return;
    }

    if (result.warnings.length > 0) {
      console.warn("Import warnings:", result.warnings);
    }

    importDocument(result.graph);
  }, [importDocument]);

  const handleNew = useCallback(() => {
    newDocument();
  }, [newDocument]);

  const handleAddNode = useCallback(
    (type: GraphNode["type"]) => {
      const node = createNode(
        type,
        240 + (Math.random() - 0.5) * 120,
        200 + (Math.random() - 0.5) * 120
      );
      addNode(node);
    },
    [addNode]
  );

  if (isLoading) {
    return (
      <div className={styles.shell}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  if (!graphState) {
    return (
      <div className={styles.shell}>
        <div className={styles.loading}>No document</div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <GraphEditor
        ref={graphEditorRef}
        audioState={audioState}
        onEnsureAudioRunning={ensureAudioRunning}
      />

      <div className={styles.topBar}>
        <div className={styles.topBarTitle}>webaudio-playground</div>
        <div className={styles.topBarControls}>
          <select
            className={styles.toolbarSelect}
            value=""
            onChange={(e) => {
              const type = e.target.value as GraphNode["type"] | "";
              if (!type) return;
              handleAddNode(type);
            }}
          >
            <option value="" disabled>
              Add node…
            </option>
            <option value="midiSource">MIDI Source</option>
            <option value="ccSource">CC Source</option>
            <option value="midiPitch">MIDI Pitch</option>
            <option value="oscillator">Oscillator</option>
            <option value="pmOscillator">PM Osc</option>
            <option value="pmPhasor">Phasor</option>
            <option value="pmSin">Sin</option>
            <option value="envelope">Envelope</option>
            <option value="gain">Gain</option>
            <option value="filter">Filter</option>
            <option value="delay">Delay</option>
            <option value="reverb">Reverb</option>
            <option value="limiter">Limiter</option>
            <option value="samplePlayer">Sample Player</option>
            <option value="audioOut">Output</option>
          </select>
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            Undo
          </button>
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
          >
            Redo
          </button>
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={handleNew}
          >
            New
          </button>
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={handleImport}
          >
            Import
          </button>
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={handleExport}
          >
            Export
          </button>
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
              if (next === "running" && graphState)
                engine.syncGraph(graphState);
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

export function App() {
  return (
    <GraphDocProvider>
      <AppContent />
    </GraphDocProvider>
  );
}
