import { useEffect, useRef } from "react";
import type { GraphState, MidiEvent, NodeId } from "../types";
import { getAudioEngine } from "../../audio/engine";
import { routeMidi } from "../midiRouting";

type MidiQueueItem = {
  graph: GraphState;
  nodeId: NodeId;
  event: MidiEvent;
  resolve: () => void;
  reject: (err: unknown) => void;
};

type UseMidiDispatchOptions = {
  graph: GraphState;
  setGraph: React.Dispatch<React.SetStateAction<GraphState>>;
  onEnsureAudioRunning?: (graph: GraphState) => Promise<void>;
};

export function useMidiDispatch({
  graph,
  setGraph,
  onEnsureAudioRunning,
}: UseMidiDispatchOptions) {
  const pendingMidiDispatchQueueRef = useRef<MidiQueueItem[]>([]);
  const drainingMidiDispatchQueueRef = useRef(false);

  useEffect(() => {
    const queue = pendingMidiDispatchQueueRef.current;
    if (queue.length === 0) return;
    if (drainingMidiDispatchQueueRef.current) return;
    drainingMidiDispatchQueueRef.current = true;

    void (async () => {
      try {
        while (queue.length > 0) {
          const item = queue.shift()!;
          try {
            await onEnsureAudioRunning?.(item.graph);
            getAudioEngine().dispatchMidi(item.graph, item.nodeId, item.event);
            item.resolve();
          } catch (err) {
            item.reject(err);
          }
        }
      } finally {
        drainingMidiDispatchQueueRef.current = false;
      }
    })();
  }, [graph, onEnsureAudioRunning]);

  function emitMidi(nodeId: NodeId, event: MidiEvent): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      setGraph((g) => {
        const next = routeMidi(g, nodeId, event);
        pendingMidiDispatchQueueRef.current.push({
          graph: next,
          nodeId,
          event,
          resolve,
          reject,
        });
        return next;
      });
    });
  }

  return { emitMidi };
}
