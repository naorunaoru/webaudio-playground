import type { GraphNode } from "@graph/types";
import type { NodeDefinition, NodeUiProps } from "@/types/graphNodeDefinition";
import { Knob } from "@/ui/components/Knob";
import { ThemeProvider } from "@/ui/context";
import type { ControlTheme } from "@/ui/types/theme";
import { clamp } from "@/utils/math";

const attenuatorTheme: ControlTheme = {
  primary: "#f97316", // Orange
  secondary: "#fb923c",
  tertiary: "#ea580c",
};

type AttenuatorNodeGraph = Extract<GraphNode, { type: "attenuator" }>;

function defaultState(): AttenuatorNodeGraph["state"] {
  return { amount: 1 };
}

const AttenuatorUi: React.FC<NodeUiProps<AttenuatorNodeGraph>> = ({
  node,
  onPatchNode,
  startBatch,
  endBatch,
}) => {
  return (
    <ThemeProvider theme={attenuatorTheme}>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <Knob
          value={node.state.amount}
          onChange={(v) => onPatchNode(node.id, { amount: v })}
          min={0}
          max={4}
          label="Amt"
          format={(v) => v.toFixed(2)}
          onDragStart={startBatch}
          onDragEnd={endBatch}
        />
      </div>
    </ThemeProvider>
  );
};

export const attenuatorGraph: NodeDefinition<AttenuatorNodeGraph> = {
  type: "attenuator",
  title: "Atten",
  defaultState,
  ports: () => [
    { id: "in", name: "In", kind: "audio", direction: "in" },
    { id: "out", name: "Out", kind: "audio", direction: "out" },
  ],
  ui: AttenuatorUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<AttenuatorNodeGraph["state"]>;
    const d = defaultState();
    return {
      amount: clamp(s.amount ?? d.amount, 0, 4),
    };
  },
};
