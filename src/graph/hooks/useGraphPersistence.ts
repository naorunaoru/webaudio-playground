import { useEffect, useState } from "react";
import type { GraphState } from "../types";
import { loadGraphFromStorage, saveGraphToStorage } from "../graphStorage";

export function useGraphPersistence(
  initialGraph: () => GraphState,
  onGraphChange?: (graph: GraphState) => void
) {
  const [graph, setGraph] = useState<GraphState>(
    () => loadGraphFromStorage() ?? initialGraph()
  );

  useEffect(() => {
    onGraphChange?.(graph);
  }, [graph, onGraphChange]);

  useEffect(() => {
    saveGraphToStorage(graph);
  }, [graph]);

  return [graph, setGraph] as const;
}
