import type { GraphState } from "./types";
import { getNodeDef } from "./nodeRegistry";

export const GRAPH_STORAGE_KEY = "webaudio-playground:graph:v1";

export function loadGraphFromStorage(): GraphState | null {
  try {
    const raw = localStorage.getItem(GRAPH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const g = parsed as Partial<GraphState>;
    if (!Array.isArray(g.nodes) || !Array.isArray(g.connections)) return null;
    return normalizeGraph(g as GraphState);
  } catch {
    return null;
  }
}

export function saveGraphToStorage(graph: GraphState): void {
  try {
    localStorage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(graph));
  } catch {
    // ignore
  }
}

export function normalizeGraph(graph: GraphState): GraphState {
  const nodes = graph.nodes.map((n) => {
    const def = getNodeDef(n.type as any) as any;
    if (!def.normalizeState) return n;
    return { ...n, state: def.normalizeState((n as any).state) };
  });

  const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
  const connections = (graph.connections ?? []).filter((c) => {
    const fromNode = nodeById.get(c.from.nodeId);
    const toNode = nodeById.get(c.to.nodeId);
    if (!fromNode || !toNode) return false;
    const fromPort = getNodeDef(fromNode.type)
      .ports(fromNode as any)
      .find((p) => p.id === c.from.portId);
    const toPort = getNodeDef(toNode.type)
      .ports(toNode as any)
      .find((p) => p.id === c.to.portId);
    if (!fromPort || !toPort) return false;
    if (fromPort.direction !== "out" || toPort.direction !== "in") return false;
    if (fromPort.kind !== toPort.kind) return false;
    if (c.kind !== fromPort.kind) return false;
    return true;
  });

  return { ...graph, nodes, connections };
}
