import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { GraphState, MidiEvent, NodeId } from "@graph/types";
import { getAudioEngine, type MidiDispatchEvent } from "@audio/engine";
import { computeMidiPatches } from "@graph/midiRouting";
import { NODE_MODULES } from "@nodes";

type MidiQueueItem = {
  graph: GraphState;
  nodeId: NodeId;
  event: MidiEvent;
  patches: Map<NodeId, Record<string, unknown>>;
  resolve: () => void;
  reject: (err: unknown) => void;
};

type MidiContextValue = {
  /** Emit MIDI from a source node, routing through graph connections */
  emitMidi: (nodeId: NodeId, event: MidiEvent) => Promise<void>;
  /** Send MIDI directly to a target node (for control surfaces) */
  sendMidiToNode: (nodeId: NodeId, event: MidiEvent) => Promise<void>;
  /**
   * Smart dispatch: emits from source nodes, sends directly to receiver nodes.
   * Use this for control surfaces that need to work with any node type.
   */
  dispatchMidiToNode: (nodeId: NodeId, event: MidiEvent) => Promise<void>;
  /** Check if a node is a MIDI source (has midi_out port) */
  isMidiSource: (nodeId: NodeId) => boolean;
};

const MidiContext = createContext<MidiContextValue | null>(null);

type MidiProviderProps = {
  graph: GraphState;
  onEnsureAudioRunning?: () => Promise<void>;
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
            await onEnsureAudioRunningRef.current?.();
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

  const sendMidiToNode = useCallback(
    async (nodeId: NodeId, event: MidiEvent): Promise<void> => {
      const currentGraph = graphRef.current;
      await onEnsureAudioRunningRef.current?.();
      getAudioEngine().dispatchMidiDirect(currentGraph, nodeId, event);
    },
    []
  );

  const isMidiSource = useCallback((nodeId: NodeId): boolean => {
    const currentGraph = graphRef.current;
    const node = currentGraph.nodes.find((n) => n.id === nodeId);
    if (!node) return false;

    const mod = NODE_MODULES[node.type as keyof typeof NODE_MODULES];
    if (!mod) return false;

    const ports = mod.graph.ports(node.state as any);
    return ports.some(
      (p) => p.kind === "midi" && p.direction === "out"
    );
  }, []);

  const dispatchMidiToNode = useCallback(
    async (nodeId: NodeId, event: MidiEvent): Promise<void> => {
      if (isMidiSource(nodeId)) {
        await emitMidi(nodeId, event);
      } else {
        await sendMidiToNode(nodeId, event);
      }
    },
    [isMidiSource, emitMidi, sendMidiToNode]
  );

  const value: MidiContextValue = { emitMidi, sendMidiToNode, dispatchMidiToNode, isMidiSource };

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

/**
 * Subscribe to MIDI events dispatched to a specific node.
 * Returns a Set of currently active (held) notes.
 */
export function useMidiActiveNotes(nodeId: NodeId | null): Set<number> {
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!nodeId) {
      setActiveNotes(new Set());
      return;
    }

    const engine = getAudioEngine();
    const unsubscribe = engine.onMidiDispatch((evt: MidiDispatchEvent) => {
      if (evt.nodeId !== nodeId) return;

      const { event } = evt;
      if (event.type === "noteOn") {
        setActiveNotes((prev) => {
          const next = new Set(prev);
          next.add(event.note);
          return next;
        });
      } else if (event.type === "noteOff") {
        setActiveNotes((prev) => {
          const next = new Set(prev);
          next.delete(event.note);
          return next;
        });
      }
    });

    return () => {
      unsubscribe();
      setActiveNotes(new Set());
    };
  }, [nodeId]);

  return activeNotes;
}
