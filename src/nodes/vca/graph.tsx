import type { GraphNode } from "@graph/types";
import type { NodeDefinition, NodeUiProps } from "@/types/graphNodeDefinition";
import { Knob } from "@ui/components/Knob";

type VcaNode = Extract<GraphNode, { type: "vca" }>;

function defaultState(): VcaNode["state"] {
  return { baseGain: 1 };
}

const VcaUi: React.FC<NodeUiProps<VcaNode>> = ({
  node,
  onPatchNode,
  startBatch,
  endBatch,
}) => {
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <Knob
        value={node.state.baseGain}
        onChange={(v) => onPatchNode(node.id, { baseGain: v })}
        min={0}
        max={1}
        label="Gain"
        format={(v) => `${Math.round(v * 100)}%`}
        onDragStart={startBatch}
        onDragEnd={endBatch}
      />
    </div>
  );
};

export const vcaGraph: NodeDefinition<VcaNode> = {
  type: "vca",
  title: "VCA",
  defaultState,
  ports: () => [
    { id: "audio_in", name: "Audio", kind: "audio", direction: "in" },
    { id: "cv_in", name: "CV", kind: "cv", direction: "in" },
    { id: "audio_out", name: "Audio", kind: "audio", direction: "out" },
  ],
  ui: VcaUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<VcaNode["state"]>;
    const d = defaultState();
    return {
      baseGain: s.baseGain ?? d.baseGain,
    };
  },
};
