import type React from "react";
import type { GraphNode, MidiEvent, NodeId, PortSpec } from "../graph/types";

export type NodeUiProps<TNode extends GraphNode> = Readonly<{
  node: TNode;
  onPatchNode: (nodeId: NodeId, patch: Partial<TNode["state"]>) => void;
  onEmitMidi?: (nodeId: NodeId, event: MidiEvent) => void;
  debug?: unknown;
}>;

export type NodeDefinition<TNode extends GraphNode> = Readonly<{
  type: TNode["type"];
  title: string;
  defaultState: () => TNode["state"];
  ports: (node: TNode) => ReadonlyArray<PortSpec>;
  ui: React.FC<NodeUiProps<TNode>>;
  normalizeState?: (state: unknown) => TNode["state"];
  onMidi?: (
    node: TNode,
    event: MidiEvent,
    portId: string | null,
  ) => Partial<TNode["state"]> | null;
}>;
