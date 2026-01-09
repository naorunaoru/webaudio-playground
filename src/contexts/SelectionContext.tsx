import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Selected, NodeId, ConnectionId } from "../graph/types";

type SelectionContextValue = {
  selected: Selected;
  selectNode: (nodeId: NodeId) => void;
  selectConnection: (connectionId: ConnectionId) => void;
  deselect: () => void;
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Selected>({ type: "none" });

  const selectNode = useCallback((nodeId: NodeId) => {
    setSelected({ type: "node", nodeId });
  }, []);

  const selectConnection = useCallback((connectionId: ConnectionId) => {
    setSelected({ type: "connection", connectionId });
  }, []);

  const deselect = useCallback(() => {
    setSelected({ type: "none" });
  }, []);

  const value: SelectionContextValue = {
    selected,
    selectNode,
    selectConnection,
    deselect,
  };

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
