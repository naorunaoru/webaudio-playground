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
import { SelectionProvider, MidiProvider } from "./contexts";
import { createNode } from "./graph/graphUtils";
import { MenuBar, MenuBarItem } from "./ui/components/MenuBar";
import { MenuItem, MenuSeparator } from "./ui/components/Menu";
import { FloatingPanel } from "./ui/components/FloatingPanel";
import { PianoKeyboard } from "./ui/components/PianoKeyboard";
import { NODE_MODULES } from "./nodes";

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
    patchMultipleNodesEphemeral,
    undo,
    redo,
    canUndo,
    canRedo,
    undoDescription,
    redoDescription,
  } = useGraphDoc();

  const graphEditorRef = useRef<GraphEditorHandle | null>(null);
  const didAutoStartRef = useRef(false);
  const [audioState, setAudioState] = useState<AudioContextState | "off">(
    "off"
  );
  const [dspLoad, setDspLoad] = useState<number | null>(null);
  const [showKeyboard, setShowKeyboard] = useState(false);

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
    <SelectionProvider>
      <MidiProvider
        graph={graphState}
        onEnsureAudioRunning={ensureAudioRunning}
        onPatchNodesEphemeral={patchMultipleNodesEphemeral}
      >
        <div className={styles.shell}>
          <GraphEditor
            ref={graphEditorRef}
            audioState={audioState}
          />

          <div className={styles.topBar}>
            <MenuBar menuOffset={{ y: 6 }}>
              <MenuBarItem label="File" index={0}>
                <MenuItem onClick={handleNew}>New</MenuItem>
                <MenuSeparator />
                <MenuItem onClick={handleImport}>Import</MenuItem>
                <MenuItem onClick={handleExport}>Export</MenuItem>
              </MenuBarItem>

              <MenuBarItem label="Edit" index={1}>
                <MenuItem onClick={undo} disabled={!canUndo}>
                  Undo{undoDescription ? `: ${undoDescription}` : ""}
                </MenuItem>
                <MenuItem onClick={redo} disabled={!canRedo}>
                  Redo{redoDescription ? `: ${redoDescription}` : ""}
                </MenuItem>
              </MenuBarItem>

              <MenuBarItem label="Add" index={2}>
                {Object.entries(NODE_MODULES).map(([type, mod]) => (
                  <MenuItem
                    key={type}
                    onClick={() => handleAddNode(type as GraphNode["type"])}
                  >
                    {mod.graph.title}
                  </MenuItem>
                ))}
              </MenuBarItem>

              <MenuBarItem label="Audio" index={3}>
                <MenuItem
                  data-audio-toggle
                  onClick={async () => {
                    const engine = getAudioEngine();
                    const next = await engine.toggleRunning();
                    if (next === "running" && graphState)
                      engine.syncGraph(graphState);
                    setAudioState(next);
                  }}
                >
                  {audioState === "running" ? "Stop Audio" : "Start Audio"}
                </MenuItem>
              </MenuBarItem>

              <MenuBarItem label="View" index={4}>
                <MenuItem onClick={() => setShowKeyboard((v) => !v)}>
                  {showKeyboard ? "Hide Piano Keyboard" : "Show Piano Keyboard"}
                </MenuItem>
              </MenuBarItem>
            </MenuBar>

            <div
              className={styles.toolbarStat}
              title="Approximate audio DSP load from custom AudioWorklet processors (not total system CPU)."
            >
              DSP:{" "}
              <span className={styles.toolbarStatValue}>
                {dspLoad == null ? "—" : `${Math.round(dspLoad * 100)}%`}
              </span>
            </div>
          </div>
        </div>

        <FloatingPanel
          title="Piano Keyboard"
          open={showKeyboard}
          onClose={() => setShowKeyboard(false)}
          defaultPosition={{ x: 100, y: window.innerHeight - 200 }}
        >
          <PianoKeyboard octaves={2} />
        </FloatingPanel>
      </MidiProvider>
    </SelectionProvider>
  );
}

export function App() {
  return (
    <GraphDocProvider>
      <AppContent />
    </GraphDocProvider>
  );
}
