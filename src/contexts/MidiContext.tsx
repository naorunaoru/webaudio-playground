import {
  createContext,
  useContext,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { GraphState, MidiEvent, NodeId } from "../graph/types";
import { getAudioEngine } from "../audio/engine";
import { computeMidiPatches } from "../graph/midiRouting";

type MidiQueueItem = {
  graph: GraphState;
  nodeId: NodeId;
  event: MidiEvent;
  patches: Map<NodeId, Record<string, unknown>>;
  resolve: () => void;
  reject: (err: unknown) => void;
};

type MidiContextValue = {
  emitMidi: (nodeId: NodeId, event: MidiEvent) => Promise<void>;
};

const MidiContext = createContext<MidiContextValue | null>(null);

type MidiProviderProps = {
  graph: GraphState;
  onEnsureAudioRunning?: (graph: GraphState) => Promise<void>;
  onPatchNodesEphemeral?: (patches: Map<NodeId, Record<string, unknown>>) => void;
  children: ReactNode;
};

export function MidiProvider({
  graph,
  onEnsureAudioRunning,
  onPatchNodesEphemeral,
  children,
}: MidiProviderProps) {
  const pendingMidiDispatchQueueRef = useRef<MidiQueueItem[]>([]);
  const drainingMidiDispatchQueueRef = useRef(false);
  const graphRef = useRef(graph);
  const onEnsureAudioRunningRef = useRef(onEnsureAudioRunning);
  const onPatchNodesEphemeralRef = useRef(onPatchNodesEphemeral);

  // Keep refs up to date
  graphRef.current = graph;
  onEnsureAudioRunningRef.current = onEnsureAudioRunning;
  onPatchNodesEphemeralRef.current = onPatchNodesEphemeral;

  const drainQueue = useCallback(() => {
    const queue = pendingMidiDispatchQueueRef.current;
    if (queue.length === 0) return;
    if (drainingMidiDispatchQueueRef.current) return;
    drainingMidiDispatchQueueRef.current = true;

    void (async () => {
      try {
        while (queue.length > 0) {
          const item = queue.shift()!;
          try {
            await onEnsureAudioRunningRef.current?.(item.graph);
            getAudioEngine().dispatchMidi(
              item.graph,
              item.nodeId,
              item.event,
              item.patches
            );
            item.resolve();
          } catch (err) {
            item.reject(err);
          }
        }
      } finally {
        drainingMidiDispatchQueueRef.current = false;
      }
    })();
  }, []);

  const emitMidi = useCallback(
    (nodeId: NodeId, event: MidiEvent): Promise<void> => {
      return new Promise<void>((resolve, reject) => {
        const currentGraph = graphRef.current;
        const patches = computeMidiPatches(currentGraph, nodeId, event);

        // Persist CC-derived state changes without creating history entries.
        if (event.type === "cc") {
          onPatchNodesEphemeralRef.current?.(patches);
        }

        pendingMidiDispatchQueueRef.current.push({
          graph: currentGraph,
          nodeId,
          event,
          patches,
          resolve,
          reject,
        });

        drainQueue();
      });
    },
    [drainQueue]
  );

  const value: MidiContextValue = { emitMidi };

  return (
    <MidiContext.Provider value={value}>
      {children}
    </MidiContext.Provider>
  );
}

export function useMidi(): MidiContextValue {
  const ctx = useContext(MidiContext);
  if (!ctx) {
    throw new Error("useMidi must be used within MidiProvider");
  }
  return ctx;
}
