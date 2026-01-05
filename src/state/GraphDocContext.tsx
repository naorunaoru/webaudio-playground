import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { type DocHandle } from "@automerge/automerge-repo";
import * as Automerge from "@automerge/automerge";
import type { GraphDoc, DocConnection } from "./types";
import type { GraphState, NodeId, ConnectionId, GraphNode } from "../graph/types";
import { docToGraphState, graphStateToDoc } from "./converters";
import {
  getRepo,
  getOrCreateMainDocument,
  createNewDocument,
  createDocumentFromImport,
  waitForStorageReady,
} from "./repo";

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

  // Format individual values
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
      // For nested objects like env, just mention the key
      return key;
    }
    return key;
  });

  return `${nodeType}: ${parts.join(", ")}`;
}

type GraphDocContextValue = {
  /** Current graph state (array-based, for UI/audio) */
  graphState: GraphState | null;

  /** Loading state */
  isLoading: boolean;

  /** Mutation functions */
  moveNode: (nodeId: NodeId, x: number, y: number) => void;
  addNode: (node: GraphNode) => void;
  deleteNode: (nodeId: NodeId) => void;
  patchNode: (nodeId: NodeId, patch: Record<string, unknown>) => void;
  patchMultipleNodes: (patches: Map<NodeId, Record<string, unknown>>) => void;
  addConnection: (connection: DocConnection) => void;
  deleteConnection: (connectionId: ConnectionId) => void;
  setZOrder: (nodeId: NodeId, zIndex: number) => void;

  /** Ephemeral mutations (no history) - for transient state like MIDI triggers, playhead */
  patchNodeEphemeral: (nodeId: NodeId, patch: Record<string, unknown>) => void;
  patchMultipleNodesEphemeral: (patches: Map<NodeId, Record<string, unknown>>) => void;

  /** Batch operations for continuous changes (sliders, drags) */
  startBatch: () => void;
  endBatch: () => void;

  /** Undo/Redo */
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  /** Document operations */
  newDocument: () => void;
  importDocument: (graph: GraphState) => void;
};

const GraphDocContext = createContext<GraphDocContextValue | null>(null);

export function GraphDocProvider({ children }: { children: ReactNode }) {
  const [handle, setHandle] = useState<DocHandle<GraphDoc> | null>(null);
  const [graphState, setGraphState] = useState<GraphState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Undo/redo stacks
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);

  // Batching state
  const isBatchingRef = useRef(false);
  const batchSnapshotRef = useRef<Uint8Array | null>(null);

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
        setGraphState(docToGraphState(doc));
      }

      setIsLoading(false);

      // Subscribe to changes
      const onChange = () => {
        const doc = docHandle.doc();
        if (doc) {
          setGraphState(docToGraphState(doc));
        }
      };

      docHandle.on("change", onChange);

      return () => {
        docHandle.off("change", onChange);
      };
    }

    init();

    return () => {
      cancelled = true;
    };
  }, []);

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
    setRedoStack([]); // Clear redo on new change
  }, []);

  // Pending description for batch operations
  const batchDescriptionRef = useRef<string | null>(null);

  // Helper to save current state before mutation
  const saveBeforeMutation = useCallback(
    (description: string) => {
      if (!handle) return;

      // If batching, store description for later but don't save yet
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

  // Helper to get node type for descriptions
  const getNodeType = useCallback(
    (nodeId: NodeId): string => {
      const doc = handle?.doc();
      return doc?.nodes[nodeId]?.type ?? "node";
    },
    [handle]
  );

  // Mutation functions
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

        // Remove connections referencing this node
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
      const descriptions = Array.from(patches.entries()).map(([nodeId, patch]) => {
        const nodeType = getNodeType(nodeId);
        return formatPatchDescription(nodeType, patch);
      });
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

  // Ephemeral mutations - no history recording
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

  // Z-order is ephemeral - persists but doesn't create undo history
  const setZOrder = useCallback(
    (nodeId: NodeId, zIndex: number) => {
      if (!handle) return;

      handle.change((doc) => {
        doc.nodeZOrder[nodeId] = zIndex;
      });
    },
    [handle]
  );

  // Batch operations
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
      // Only push to undo if something actually changed during the batch
      const currentBinary = Automerge.save(doc);
      const snapshotBinary = batchSnapshotRef.current;

      // Compare binaries - if they're different, something changed
      if (currentBinary.length !== snapshotBinary.length ||
          !currentBinary.every((byte, i) => byte === snapshotBinary[i])) {
        const description = batchDescriptionRef.current ?? "Batch change";
        pushUndo(snapshotBinary, description);
      }
    }

    isBatchingRef.current = false;
    batchSnapshotRef.current = null;
    batchDescriptionRef.current = null;
  }, [handle, pushUndo]);

  // Undo/Redo
  const undo = useCallback(() => {
    if (!handle || undoStack.length === 0) return;

    const doc = handle.doc();
    if (!doc) return;

    // Pop from undo stack
    const entry = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));

    // Save current state to redo stack (with the description of what we're undoing)
    const currentBinary = Automerge.save(doc);
    console.log(`[History] Undo: ${entry.description}`);
    setRedoStack((prev) => [...prev, { binary: currentBinary, timestamp: Date.now(), description: entry.description }]);

    const restoredDoc = Automerge.load<GraphDoc>(entry.binary);

    // Merge the restored doc into current handle
    handle.change((doc) => {
      // Clear and replace all data
      for (const key of Object.keys(doc.nodes)) {
        delete doc.nodes[key];
      }
      for (const key of Object.keys(doc.connections)) {
        delete doc.connections[key];
      }
      for (const key of Object.keys(doc.nodeZOrder)) {
        delete doc.nodeZOrder[key];
      }

      // Copy from restored
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

    // Pop from redo stack
    const entry = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));

    // Save current state to undo stack (with the description of what we're redoing)
    const currentBinary = Automerge.save(doc);
    console.log(`[History] Redo: ${entry.description}`);
    setUndoStack((prev) => [...prev, { binary: currentBinary, timestamp: Date.now(), description: entry.description }]);

    const restoredDoc = Automerge.load<GraphDoc>(entry.binary);

    handle.change((doc) => {
      // Clear and replace all data
      for (const key of Object.keys(doc.nodes)) {
        delete doc.nodes[key];
      }
      for (const key of Object.keys(doc.connections)) {
        delete doc.connections[key];
      }
      for (const key of Object.keys(doc.nodeZOrder)) {
        delete doc.nodeZOrder[key];
      }

      // Copy from restored
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

  // Document operations
  const newDocument = useCallback(() => {
    const repo = getRepo();
    const newHandle = createNewDocument(repo);

    // Clear history
    setUndoStack([]);
    setRedoStack([]);

    setHandle(newHandle);

    const doc = newHandle.doc();
    if (doc) {
      setGraphState(docToGraphState(doc));
    }
  }, []);

  const importDocument = useCallback((graph: GraphState) => {
    const repo = getRepo();
    const graphDoc = graphStateToDoc(graph);
    const newHandle = createDocumentFromImport(repo, graphDoc);

    // Clear history
    setUndoStack([]);
    setRedoStack([]);

    setHandle(newHandle);
    setGraphState(graph);
  }, []);

  const value: GraphDocContextValue = {
    graphState,
    isLoading,
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
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    newDocument,
    importDocument,
  };

  return (
    <GraphDocContext.Provider value={value}>
      {children}
    </GraphDocContext.Provider>
  );
}

export function useGraphDoc(): GraphDocContextValue {
  const ctx = useContext(GraphDocContext);
  if (!ctx) {
    throw new Error("useGraphDoc must be used within GraphDocProvider");
  }
  return ctx;
}
