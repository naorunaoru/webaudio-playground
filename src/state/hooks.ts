import { useSyncExternalStore, useCallback } from "react";
import type { GraphState, GraphNode, NodeId } from "@graph/types";
import type { GraphStore, StructuralState } from "./GraphStore";

export function useNodeState(
  store: GraphStore,
  nodeId: NodeId,
): GraphNode | undefined {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribeNode(nodeId, listener),
    [store, nodeId],
  );
  const getSnapshot = useCallback(
    () => store.getNodeSnapshot(nodeId),
    [store, nodeId],
  );
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function useStructuralState(store: GraphStore): StructuralState {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribeStructural(listener),
    [store],
  );
  const getSnapshot = useCallback(
    () => store.getStructuralSnapshot(),
    [store],
  );
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function useFullGraphState(store: GraphStore): GraphState | null {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribeFullGraph(listener),
    [store],
  );
  const getSnapshot = useCallback(
    () => store.getFullGraphSnapshot(),
    [store],
  );
  return useSyncExternalStore(subscribe, getSnapshot);
}
