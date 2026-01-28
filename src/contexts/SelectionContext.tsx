import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import type { Selected, NodeId, ConnectionId } from "@graph/types";

type SelectionContextValue = {
  selected: Selected;
  selectNodes: (nodeIds: NodeId | Set<NodeId>) => void;
  selectConnection: (connectionId: ConnectionId) => void;
  deselect: () => void;
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Selected>({ type: "none" });

  const selectNodes = useCallback((nodeIds: NodeId | Set<NodeId>) => {
    if (typeof nodeIds === "string") {
      setSelected({ type: "nodes", nodeIds: new Set([nodeIds]) });
    } else if (nodeIds.size === 0) {
      setSelected({ type: "none" });
    } else {
      setSelected({ type: "nodes", nodeIds });
    }
  }, []);

  const selectConnection = useCallback((connectionId: ConnectionId) => {
    setSelected({ type: "connection", connectionId });
  }, []);

  const deselect = useCallback(() => {
    setSelected({ type: "none" });
  }, []);

  const value: SelectionContextValue = useMemo(
    () => ({ selected, selectNodes, selectConnection, deselect }),
    [selected, selectNodes, selectConnection, deselect],
  );

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) {
    throw new Error("useSelection must be used within SelectionProvider");
  }
  return ctx;
}
