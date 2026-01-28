import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import {
  type DocHandle,
  type DocHandleChangePayload,
} from "@automerge/automerge-repo";
import * as Automerge from "@automerge/automerge";
import type { GraphDoc, DocConnection, DocUiState } from "./types";
import type { GraphState, NodeId, ConnectionId, GraphNode } from "@graph/types";
import { graphStateToDoc } from "./converters";
import {
  getRepo,
  getOrCreateMainDocument,
  createNewDocument,
  createDocumentFromImport,
  waitForStorageReady,
} from "./repo";
import { getAudioEngine } from "@audio/engine";
import { GraphStore } from "./GraphStore";
import type { StructuralState } from "./GraphStore";
import {
  useNodeState as useNodeStatePrimitive,
  useStructuralState as useStructuralStatePrimitive,
  useFullGraphState as useFullGraphStatePrimitive,
} from "./hooks";

type HistoryEntry = {
  binary: Uint8Array;
  timestamp: number;
  description: string;
};

const MAX_HISTORY = 100;

function formatPatchDescription(
  nodeType: string,
  patch: Record<string, unknown>
): string {
  const keys = Object.keys(patch);
  if (keys.length === 0) return `Update ${nodeType}`;

  const parts = keys.map((key) => {
    const value = patch[key];
    if (typeof value === "number") {
      return `${key} = ${Number.isInteger(value) ? value : value.toFixed(2)}`;
    }
    if (typeof value === "boolean") {
      return `${key} = ${value ? "on" : "off"}`;
    }
    if (typeof value === "string") {
      return `${key} = ${value}`;
    }
    if (typeof value === "object" && value !== null) {
      return key;
    }
    return key;
  });

  return `${nodeType}: ${parts.join(", ")}`;
}

// ==================== Context Types ====================

type GraphStoreContextValue = {
  store: GraphStore;
  moveNode: (nodeId: NodeId, x: number, y: number) => void;
  addNode: (node: GraphNode) => void;
  deleteNode: (nodeId: NodeId) => void;
  patchNode: (nodeId: NodeId, patch: Record<string, unknown>) => void;
  patchMultipleNodes: (patches: Map<NodeId, Record<string, unknown>>) => void;
  addConnection: (connection: DocConnection) => void;
  deleteConnection: (connectionId: ConnectionId) => void;
  setZOrder: (nodeId: NodeId, zIndex: number) => void;
  patchNodeEphemeral: (nodeId: NodeId, patch: Record<string, unknown>) => void;
  patchMultipleNodesEphemeral: (
    patches: Map<NodeId, Record<string, unknown>>
  ) => void;
  startBatch: () => void;
  endBatch: () => void;
};

type GraphMetaContextValue = {
  isLoading: boolean;
  audioState: AudioContextState | "off";
  onAudioToggle: () => void;
  ensureAudioRunning: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoDescription: string | null;
  redoDescription: string | null;
  newDocument: () => void;
  importDocument: (graph: GraphState) => void;
  uiState: DocUiState;
  setKeyboardState: (state: {
    visible: boolean;
    x: number;
    y: number;
  }) => void;
  setContextState: (state: {
    tempo?: number;
    a4Hz?: number;
    timeSignature?: [number, number];
  }) => void;
  setViewportState: (state: { centerX: number; centerY: number }) => void;
};

// Legacy combined type for useGraphDoc() compatibility
type GraphDocContextValue = GraphStoreContextValue &
  GraphMetaContextValue & {
    graphState: GraphState | null;
  };

// ==================== Contexts ====================

const GraphStoreCtx = createContext<GraphStoreContextValue | null>(null);
const GraphMetaCtx = createContext<GraphMetaContextValue | null>(null);

// ==================== Provider ====================

export function GraphDocProvider({ children }: { children: ReactNode }) {
  const [handle, setHandle] = useState<DocHandle<GraphDoc> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [audioState, setAudioState] = useState<AudioContextState | "off">(
    "off"
  );
  const [uiState, setUiState] = useState<DocUiState>({});

  // The graph store replaces useState<GraphState>
  const storeRef = useRef(new GraphStore());
  const store = storeRef.current;

  // Flag for undo/redo/import — tells the change handler to do a full replace
  const isReplacingRef = useRef(false);

  // Undo/redo stacks
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);

  // Batching state
  const isBatchingRef = useRef(false);
  const batchSnapshotRef = useRef<Uint8Array | null>(null);
  const batchDescriptionRef = useRef<string | null>(null);

  // Initialize repo and load document
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const repo = getRepo();
      await waitForStorageReady();
      const { handle: docHandle } = await getOrCreateMainDocument(repo);

      if (cancelled) return;

      setHandle(docHandle);

      // Initial state
      const doc = docHandle.doc();
      if (doc) {
        store.replaceAll(doc);
        setUiState(doc.meta?.ui ?? {});
      }

      setIsLoading(false);
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [store]);

  // Subscribe to handle changes — patch-aware
  useEffect(() => {
    if (!handle) return;

    const onChange = (payload: DocHandleChangePayload<GraphDoc>) => {
      if (isReplacingRef.current) {
        isReplacingRef.current = false;
        store.replaceAll(payload.doc);
        setUiState(payload.doc.meta?.ui ?? {});
        return;
      }

      store.applyPatches(payload.patches, payload.doc);

      // Update uiState only when meta patches are present
      const hasMetaPatch = payload.patches.some((p) => p.path[0] === "meta");
      if (hasMetaPatch) {
        setUiState(payload.doc.meta?.ui ?? {});
      }
    };

    handle.on("change", onChange);

    return () => {
      handle.off("change", onChange);
    };
  }, [handle, store]);

  // Helper to push to undo stack
  const pushUndo = useCallback((binary: Uint8Array, description: string) => {
    console.log(`[History] ${description}`);
    setUndoStack((prev) => {
      const next = [...prev, { binary, timestamp: Date.now(), description }];
      if (next.length > MAX_HISTORY) {
        return next.slice(next.length - MAX_HISTORY);
      }
      return next;
    });
    setRedoStack([]);
  }, []);

  // Helper to save current state before mutation
  const saveBeforeMutation = useCallback(
    (description: string) => {
      if (!handle) return;

      if (isBatchingRef.current) {
        batchDescriptionRef.current = description;
        return;
      }

      const doc = handle.doc();
      if (doc) {
        const binary = Automerge.save(doc);
        pushUndo(binary, description);
      }
    },
    [handle, pushUndo]
  );

  const getNodeType = useCallback(
    (nodeId: NodeId): string => {
      const doc = handle?.doc();
      return doc?.nodes[nodeId]?.type ?? "node";
    },
    [handle]
  );

  // ==================== Mutation functions ====================

  const moveNode = useCallback(
    (nodeId: NodeId, x: number, y: number) => {
      if (!handle) return;
      const nodeType = getNodeType(nodeId);
      saveBeforeMutation(`Move ${nodeType}`);

      handle.change((doc) => {
        const node = doc.nodes[nodeId];
        if (node) {
          node.x = x;
          node.y = y;
          doc.meta.lastModifiedAt = Date.now();
        }
      });
    },
    [handle, saveBeforeMutation, getNodeType]
  );

  const addNode = useCallback(
    (node: GraphNode) => {
      if (!handle) return;
      saveBeforeMutation(`Add ${node.type}`);

      handle.change((doc) => {
        doc.nodes[node.id] = {
          id: node.id,
          type: node.type,
          x: node.x,
          y: node.y,
          state: node.state as Record<string, unknown>,
        };
        doc.meta.lastModifiedAt = Date.now();
      });
    },
    [handle, saveBeforeMutation]
  );

  const deleteNode = useCallback(
    (nodeId: NodeId) => {
      if (!handle) return;
      const nodeType = getNodeType(nodeId);
      saveBeforeMutation(`Delete ${nodeType}`);

      handle.change((doc) => {
        delete doc.nodes[nodeId];
        delete doc.nodeZOrder[nodeId];

        for (const connId of Object.keys(doc.connections)) {
          const conn = doc.connections[connId];
          if (conn.from.nodeId === nodeId || conn.to.nodeId === nodeId) {
            delete doc.connections[connId];
          }
        }

        doc.meta.lastModifiedAt = Date.now();
      });
    },
    [handle, saveBeforeMutation, getNodeType]
  );

  const patchNode = useCallback(
    (nodeId: NodeId, patch: Record<string, unknown>) => {
      if (!handle) return;
      const nodeType = getNodeType(nodeId);
      const description = formatPatchDescription(nodeType, patch);
      saveBeforeMutation(description);

      handle.change((doc) => {
        const node = doc.nodes[nodeId];
        if (node) {
          Object.assign(node.state, patch);
          doc.meta.lastModifiedAt = Date.now();
        }
      });
    },
    [handle, saveBeforeMutation, getNodeType]
  );

  const patchMultipleNodes = useCallback(
    (patches: Map<NodeId, Record<string, unknown>>) => {
      if (!handle || patches.size === 0) return;
      const descriptions = Array.from(patches.entries()).map(
        ([nodeId, patch]) => {
          const nodeType = getNodeType(nodeId);
          return formatPatchDescription(nodeType, patch);
        }
      );
      saveBeforeMutation(descriptions.join("; "));

      handle.change((doc) => {
        for (const [nodeId, patch] of patches) {
          const node = doc.nodes[nodeId];
          if (node) {
            Object.assign(node.state, patch);
          }
        }
        doc.meta.lastModifiedAt = Date.now();
      });
    },
    [handle, saveBeforeMutation, getNodeType]
  );

  const patchNodeEphemeral = useCallback(
    (nodeId: NodeId, patch: Record<string, unknown>) => {
      if (!handle) return;

      handle.change((doc) => {
        const node = doc.nodes[nodeId];
        if (node) {
          Object.assign(node.state, patch);
        }
      });
    },
    [handle]
  );

  const patchMultipleNodesEphemeral = useCallback(
    (patches: Map<NodeId, Record<string, unknown>>) => {
      if (!handle || patches.size === 0) return;

      handle.change((doc) => {
        for (const [nodeId, patch] of patches) {
          const node = doc.nodes[nodeId];
          if (node) {
            Object.assign(node.state, patch);
          }
        }
      });
    },
    [handle]
  );

  const addConnection = useCallback(
    (connection: DocConnection) => {
      if (!handle) return;
      saveBeforeMutation("Add connection");

      handle.change((doc) => {
        doc.connections[connection.id] = connection;
        doc.meta.lastModifiedAt = Date.now();
      });
    },
    [handle, saveBeforeMutation]
  );

  const deleteConnection = useCallback(
    (connectionId: ConnectionId) => {
      if (!handle) return;
      saveBeforeMutation("Delete connection");

      handle.change((doc) => {
        delete doc.connections[connectionId];
        doc.meta.lastModifiedAt = Date.now();
      });
    },
    [handle, saveBeforeMutation]
  );

  const setZOrder = useCallback(
    (nodeId: NodeId, zIndex: number) => {
      if (!handle) return;

      handle.change((doc) => {
        if (!doc.nodeZOrder) {
          doc.nodeZOrder = {};
        }
        doc.nodeZOrder[nodeId] = zIndex;
      });
    },
    [handle]
  );

  // ==================== Batch operations ====================

  const startBatch = useCallback(() => {
    if (!handle || isBatchingRef.current) return;

    const doc = handle.doc();
    if (doc) {
      batchSnapshotRef.current = Automerge.save(doc);
      isBatchingRef.current = true;
    }
  }, [handle]);

  const endBatch = useCallback(() => {
    if (!handle || !isBatchingRef.current || !batchSnapshotRef.current) return;

    const doc = handle.doc();
    if (doc) {
      const currentBinary = Automerge.save(doc);
      const snapshotBinary = batchSnapshotRef.current;

      if (
        currentBinary.length !== snapshotBinary.length ||
        !currentBinary.every((byte, i) => byte === snapshotBinary[i])
      ) {
        const description = batchDescriptionRef.current ?? "Batch change";
        pushUndo(snapshotBinary, description);
      }
    }

    isBatchingRef.current = false;
    batchSnapshotRef.current = null;
    batchDescriptionRef.current = null;
  }, [handle, pushUndo]);

  // ==================== Undo/Redo ====================

  const undo = useCallback(() => {
    if (!handle || undoStack.length === 0) return;

    const doc = handle.doc();
    if (!doc) return;

    const entry = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));

    const currentBinary = Automerge.save(doc);
    console.log(`[History] Undo: ${entry.description}`);
    setRedoStack((prev) => [
      ...prev,
      {
        binary: currentBinary,
        timestamp: Date.now(),
        description: entry.description,
      },
    ]);

    const restoredDoc = Automerge.load<GraphDoc>(entry.binary);

    isReplacingRef.current = true;
    handle.change((doc) => {
      for (const key of Object.keys(doc.nodes)) {
        delete doc.nodes[key];
      }
      for (const key of Object.keys(doc.connections)) {
        delete doc.connections[key];
      }
      for (const key of Object.keys(doc.nodeZOrder)) {
        delete doc.nodeZOrder[key];
      }

      for (const [id, node] of Object.entries(restoredDoc.nodes)) {
        doc.nodes[id] = { ...node };
      }
      for (const [id, conn] of Object.entries(restoredDoc.connections)) {
        doc.connections[id] = { ...conn };
      }
      for (const [id, z] of Object.entries(restoredDoc.nodeZOrder)) {
        doc.nodeZOrder[id] = z;
      }
      doc.meta = { ...restoredDoc.meta };
    });
  }, [handle, undoStack]);

  const redo = useCallback(() => {
    if (!handle || redoStack.length === 0) return;

    const doc = handle.doc();
    if (!doc) return;

    const entry = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));

    const currentBinary = Automerge.save(doc);
    console.log(`[History] Redo: ${entry.description}`);
    setUndoStack((prev) => [
      ...prev,
      {
        binary: currentBinary,
        timestamp: Date.now(),
        description: entry.description,
      },
    ]);

    const restoredDoc = Automerge.load<GraphDoc>(entry.binary);

    isReplacingRef.current = true;
    handle.change((doc) => {
      for (const key of Object.keys(doc.nodes)) {
        delete doc.nodes[key];
      }
      for (const key of Object.keys(doc.connections)) {
        delete doc.connections[key];
      }
      for (const key of Object.keys(doc.nodeZOrder)) {
        delete doc.nodeZOrder[key];
      }

      for (const [id, node] of Object.entries(restoredDoc.nodes)) {
        doc.nodes[id] = { ...node };
      }
      for (const [id, conn] of Object.entries(restoredDoc.connections)) {
        doc.connections[id] = { ...conn };
      }
      for (const [id, z] of Object.entries(restoredDoc.nodeZOrder)) {
        doc.nodeZOrder[id] = z;
      }
      doc.meta = { ...restoredDoc.meta };
    });
  }, [handle, redoStack]);

  // ==================== Document operations ====================

  const newDocument = useCallback(() => {
    const repo = getRepo();
    const newHandle = createNewDocument(repo);

    setUndoStack([]);
    setRedoStack([]);

    setHandle(newHandle);

    const doc = newHandle.doc();
    if (doc) {
      store.replaceAll(doc);
      setUiState(doc.meta?.ui ?? {});
    }
  }, [store]);

  const importDocument = useCallback(
    (graph: GraphState) => {
      const repo = getRepo();
      const graphDoc = graphStateToDoc(graph);
      const newHandle = createDocumentFromImport(repo, graphDoc);

      setUndoStack([]);
      setRedoStack([]);

      setHandle(newHandle);

      // Initialize store from the new handle's doc
      const doc = newHandle.doc();
      if (doc) {
        store.replaceAll(doc);
        setUiState(doc.meta?.ui ?? {});
      }
    },
    [store]
  );

  // ==================== UI state ====================

  const setKeyboardState = useCallback(
    (state: { visible: boolean; x: number; y: number }) => {
      if (!handle) return;

      handle.change((doc) => {
        if (!doc.meta.ui) {
          doc.meta.ui = {};
        }
        doc.meta.ui.keyboard = state;
      });
    },
    [handle]
  );

  const setContextState = useCallback(
    (state: {
      tempo?: number;
      a4Hz?: number;
      timeSignature?: [number, number];
    }) => {
      if (!handle) return;

      handle.change((doc) => {
        if (!doc.meta.ui) {
          doc.meta.ui = {};
        }
        if (!doc.meta.ui.context) {
          doc.meta.ui.context = {};
        }
        Object.assign(doc.meta.ui.context, state);
      });
    },
    [handle]
  );

  const setViewportState = useCallback(
    (state: { centerX: number; centerY: number }) => {
      if (!handle) return;

      handle.change((doc) => {
        if (!doc.meta.ui) {
          doc.meta.ui = {};
        }
        doc.meta.ui.viewport = state;
      });
    },
    [handle]
  );

  // ==================== Audio ====================

  const onAudioToggle = useCallback(async () => {
    const engine = getAudioEngine();
    const next = await engine.toggleRunning();
    if (next === "running") {
      const graph = store.getFullGraphSnapshot();
      if (graph) engine.syncGraph(graph);
    }
    setAudioState(next);
  }, [store]);

  const ensureAudioRunning = useCallback(async () => {
    const engine = getAudioEngine();
    await engine.ensureRunning();
    const graph = store.getFullGraphSnapshot();
    if (graph) engine.syncGraph(graph);
    setAudioState(engine.getStatus()?.state ?? "off");
  }, [store]);

  useEffect(() => {
    setAudioState(getAudioEngine().getStatus()?.state ?? "off");
  }, []);

  // Sync graph to audio engine via store subscription (no React rerender)
  const audioStateRef = useRef(audioState);
  audioStateRef.current = audioState;
  useEffect(() => {
    return store.subscribeFullGraph(() => {
      if (audioStateRef.current === "off") return;
      const graph = store.getFullGraphSnapshot();
      if (graph) getAudioEngine().syncGraph(graph);
    });
  }, [store]);

  // ==================== Context values ====================

  const storeValue: GraphStoreContextValue = {
    store,
    moveNode,
    addNode,
    deleteNode,
    patchNode,
    patchMultipleNodes,
    addConnection,
    deleteConnection,
    setZOrder,
    patchNodeEphemeral,
    patchMultipleNodesEphemeral,
    startBatch,
    endBatch,
  };

  const metaValue: GraphMetaContextValue = {
    isLoading,
    audioState,
    onAudioToggle,
    ensureAudioRunning,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undoDescription:
      undoStack.length > 0
        ? undoStack[undoStack.length - 1].description
        : null,
    redoDescription:
      redoStack.length > 0
        ? redoStack[redoStack.length - 1].description
        : null,
    newDocument,
    importDocument,
    uiState,
    setKeyboardState,
    setContextState,
    setViewportState,
  };

  return (
    <GraphStoreCtx.Provider value={storeValue}>
      <GraphMetaCtx.Provider value={metaValue}>{children}</GraphMetaCtx.Provider>
    </GraphStoreCtx.Provider>
  );
}

// ==================== Hooks ====================

export function useGraphStore(): GraphStoreContextValue {
  const ctx = useContext(GraphStoreCtx);
  if (!ctx) {
    throw new Error("useGraphStore must be used within GraphDocProvider");
  }
  return ctx;
}

export function useGraphMeta(): GraphMetaContextValue {
  const ctx = useContext(GraphMetaCtx);
  if (!ctx) {
    throw new Error("useGraphMeta must be used within GraphDocProvider");
  }
  return ctx;
}

/** Per-node subscription — only rerenders when this node changes. */
export function useNodeState(nodeId: NodeId) {
  const { store } = useGraphStore();
  return useNodeStatePrimitive(store, nodeId);
}

/** Structural state — rerenders on node add/remove, connections, positions, z-order. */
export function useStructuralState(): StructuralState {
  const { store } = useGraphStore();
  return useStructuralStatePrimitive(store);
}

/** Full graph — rerenders on any graph change. For audio engine, export, MIDI. */
export function useFullGraphState(): GraphState | null {
  const { store } = useGraphStore();
  return useFullGraphStatePrimitive(store);
}

/**
 * Legacy compatibility hook — returns the combined context value.
 * Prefer useGraphStore(), useGraphMeta(), useNodeState(), useStructuralState(),
 * or useFullGraphState() for better performance.
 */
export function useGraphDoc(): GraphDocContextValue {
  const storeCtx = useGraphStore();
  const metaCtx = useGraphMeta();
  const graphState = useFullGraphState();
  return {
    ...storeCtx,
    ...metaCtx,
    graphState,
  };
}
