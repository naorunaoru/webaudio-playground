import type React from "react";
import type {
  ConnectionEndpoint,
  MidiEvent,
  NodeId,
  PortKind,
} from "@graph/types";
import { getNodeDef } from "@graph/nodeRegistry";
import { portMetaForNode } from "@graph/graphUtils";
import { useNodeState } from "@state";
import { GraphNodeCard } from "./GraphNodeCard";

export type GraphNodeCardContainerProps = {
  nodeId: NodeId;
  isSelected: boolean;
  zIndex: number;
  audioState: AudioContextState | "off";
  connectedPorts?: ReadonlySet<string>;
  rootRef: React.RefObject<HTMLElement | null>;
  scrollRef: React.RefObject<{ x: number; y: number } | null>;
  onRegisterNodeEl: (nodeId: NodeId, el: HTMLElement | null) => void;
  onSelectNode: (nodeId: NodeId) => void;
  onStartNodeDrag: (
    nodeId: NodeId,
    pointerX: number,
    pointerY: number,
  ) => void;
  onStartConnectionDrag: (
    from: ConnectionEndpoint,
    kind: PortKind,
    x: number,
    y: number,
  ) => void;
  onEndDrag: () => void;
  onPatchNode: (nodeId: NodeId, patch: Partial<any>) => void;
  onPatchNodeEphemeral?: (nodeId: NodeId, patch: Partial<any>) => void;
  onEmitMidi: (nodeId: NodeId, event: MidiEvent) => Promise<void>;
  startBatch?: () => void;
  endBatch?: () => void;
};

export function GraphNodeCardContainer({
  nodeId,
  isSelected,
  zIndex,
  audioState,
  connectedPorts,
  rootRef,
  scrollRef,
  onRegisterNodeEl,
  onSelectNode,
  onStartNodeDrag,
  onStartConnectionDrag,
  onEndDrag,
  onPatchNode,
  onPatchNodeEphemeral,
  onEmitMidi,
  startBatch,
  endBatch,
}: GraphNodeCardContainerProps) {
  const node = useNodeState(nodeId);
  if (!node) return null;

  const def = getNodeDef(node.type);
  const ports = portMetaForNode(node);
  const Ui = (def as any).ui;
  const midiVisible = node.type === "midiSource" && !!(node.state as any).isEmitting;

  return (
    <GraphNodeCard
      node={node}
      title={def.title}
      ports={ports}
      Ui={Ui}
      isSelected={isSelected}
      zIndex={zIndex}
      audioState={audioState}
      midiVisible={midiVisible}
      connectedPorts={connectedPorts}
      rootRef={rootRef}
      scrollRef={scrollRef}
      onRegisterNodeEl={onRegisterNodeEl}
      onSelectNode={onSelectNode}
      onStartNodeDrag={onStartNodeDrag}
      onStartConnectionDrag={onStartConnectionDrag}
      onEndDrag={onEndDrag}
      onPatchNode={onPatchNode}
      onPatchNodeEphemeral={onPatchNodeEphemeral}
      onEmitMidi={onEmitMidi}
      startBatch={startBatch}
      endBatch={endBatch}
    />
  );
}
