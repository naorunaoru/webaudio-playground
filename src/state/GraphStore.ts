import type { Patch } from "@automerge/automerge";
import type {
  GraphState,
  GraphNode,
  GraphConnection,
  NodeId,
} from "@graph/types";
import type { GraphDoc } from "./types";
import { docNodeToGraphNode, docConnToGraphConn } from "./converters";

export type StructuralState = {
  nodeIds: NodeId[];
  connections: GraphConnection[];
  nodeZOrder: Record<NodeId, number>;
};

type Listener = () => void;

export class GraphStore {
  // --- Internal mutable state ---
  private nodeMap = new Map<NodeId, GraphNode>();
  private nodeVersions = new Map<NodeId, number>();
  private structural: StructuralState = {
    nodeIds: [],
    connections: [],
    nodeZOrder: {},
  };
  private structuralVersion = 0;
  private fullGraphVersion = 0;
  private cachedFullGraph: GraphState | null = null;
  private initialized = false;

  // --- Listener registries ---
  private nodeListeners = new Map<NodeId, Set<Listener>>();
  private structuralListeners = new Set<Listener>();
  private fullGraphListeners = new Set<Listener>();

  // ==================== Bulk replace (init, undo/redo, import) ====================

  replaceAll(doc: GraphDoc): void {
    this.nodeMap.clear();
    this.nodeVersions.clear();

    for (const [id, docNode] of Object.entries(doc.nodes)) {
      this.nodeMap.set(id, docNodeToGraphNode(docNode));
      this.nodeVersions.set(id, 0);
    }

    this.structural = {
      nodeIds: Array.from(this.nodeMap.keys()),
      connections: Object.values(doc.connections).map(docConnToGraphConn),
      nodeZOrder: { ...(doc.nodeZOrder ?? {}) },
    };

    this.structuralVersion++;
    this.fullGraphVersion++;
    this.cachedFullGraph = null;
    this.initialized = true;

    this.notifyAll();
  }

  // ==================== Patch-based incremental update ====================

  applyPatches(patches: Patch[], doc: GraphDoc): void {
    const changedNodeIds = new Set<NodeId>();
    let structuralChanged = false;
    let connectionsChanged = false;
    let zOrderChanged = false;

    for (const patch of patches) {
      const path = patch.path;
      if (path.length === 0) continue;

      const root = path[0] as string;

      if (root === "nodes") {
        const nodeId = path[1] as NodeId | undefined;
        if (!nodeId) {
          structuralChanged = true;
          continue;
        }

        if (patch.action === "del" && path.length === 2) {
          // Node deleted
          this.nodeMap.delete(nodeId);
          this.nodeVersions.delete(nodeId);
          structuralChanged = true;
        } else if (patch.action === "put" && path.length === 2) {
          // Node added (whole node put at nodes[id])
          const docNode = doc.nodes[nodeId];
          if (docNode) {
            this.nodeMap.set(nodeId, docNodeToGraphNode(docNode));
            this.nodeVersions.set(nodeId, 0);
          }
          structuralChanged = true;
        } else if (path.length >= 3) {
          // Property change on existing node
          const prop = path[2] as string;
          if (prop === "x" || prop === "y") {
            structuralChanged = true;
          }
          // Re-read the node from the doc
          const docNode = doc.nodes[nodeId];
          if (docNode) {
            this.nodeMap.set(nodeId, docNodeToGraphNode(docNode));
          }
          changedNodeIds.add(nodeId);
        }
      } else if (root === "connections") {
        connectionsChanged = true;
        structuralChanged = true;
      } else if (root === "nodeZOrder") {
        zOrderChanged = true;
        structuralChanged = true;
      }
      // "meta" patches are ignored — handled separately in context
    }

    // Bump node versions
    for (const id of changedNodeIds) {
      this.nodeVersions.set(id, (this.nodeVersions.get(id) ?? 0) + 1);
    }

    // Rebuild structural if needed
    if (structuralChanged) {
      const next = { ...this.structural };
      if (connectionsChanged) {
        next.connections = Object.values(doc.connections).map(
          docConnToGraphConn,
        );
      }
      if (zOrderChanged) {
        next.nodeZOrder = { ...(doc.nodeZOrder ?? {}) };
      }
      // Always rebuild nodeIds on structural change (node add/remove/reorder)
      next.nodeIds = Array.from(this.nodeMap.keys());
      this.structural = next;
      this.structuralVersion++;
    }

    if (structuralChanged || changedNodeIds.size > 0) {
      this.fullGraphVersion++;
      this.cachedFullGraph = null;
    }

    // Notify selectively
    for (const id of changedNodeIds) {
      const listeners = this.nodeListeners.get(id);
      if (listeners) {
        for (const fn of listeners) fn();
      }
    }
    if (structuralChanged) {
      for (const fn of this.structuralListeners) fn();
    }
    if (structuralChanged || changedNodeIds.size > 0) {
      for (const fn of this.fullGraphListeners) fn();
    }
  }

  // ==================== Subscription API ====================

  subscribeNode(nodeId: NodeId, listener: Listener): () => void {
    let set = this.nodeListeners.get(nodeId);
    if (!set) {
      set = new Set();
      this.nodeListeners.set(nodeId, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0) this.nodeListeners.delete(nodeId);
    };
  }

  getNodeSnapshot(nodeId: NodeId): GraphNode | undefined {
    return this.nodeMap.get(nodeId);
  }

  subscribeStructural(listener: Listener): () => void {
    this.structuralListeners.add(listener);
    return () => {
      this.structuralListeners.delete(listener);
    };
  }

  getStructuralSnapshot(): StructuralState {
    return this.structural;
  }

  subscribeFullGraph(listener: Listener): () => void {
    this.fullGraphListeners.add(listener);
    return () => {
      this.fullGraphListeners.delete(listener);
    };
  }

  getFullGraphSnapshot(): GraphState | null {
    if (!this.initialized) return null;
    if (!this.cachedFullGraph) {
      this.cachedFullGraph = {
        nodes: Array.from(this.nodeMap.values()),
        connections: this.structural.connections,
        nodeZOrder:
          Object.keys(this.structural.nodeZOrder).length > 0
            ? this.structural.nodeZOrder
            : undefined,
      };
    }
    return this.cachedFullGraph;
  }

  getNode(nodeId: NodeId): GraphNode | undefined {
    return this.nodeMap.get(nodeId);
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // ==================== Internal ====================

  private notifyAll(): void {
    // Notify all node listeners
    for (const [, listeners] of this.nodeListeners) {
      for (const fn of listeners) fn();
    }
    for (const fn of this.structuralListeners) fn();
    for (const fn of this.fullGraphListeners) fn();
  }
}
