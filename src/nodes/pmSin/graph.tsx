import type { GraphNode } from "../../graph/types";
import type { NodeDefinition, NodeUiProps } from "../../types/graphNodeDefinition";
import { Knob } from "../../ui/components";
import { ThemeProvider } from "../../ui/context";
import type { ControlTheme } from "../../ui/types/theme";

type PmSinNode = Extract<GraphNode, { type: "pmSin" }>;

const sinTheme: ControlTheme = {
  primary: "#a78bfa", // Violet (same family as PM osc)
  secondary: "#c4b5fd",
  tertiary: "#8b5cf6",
};

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function defaultState(): PmSinNode["state"] {
  return { feedback: 0 };
}

const PmSinUi: React.FC<NodeUiProps<PmSinNode>> = ({ node, onPatchNode, startBatch, endBatch }) => {
  return (
    <ThemeProvider theme={sinTheme}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Knob
          value={clamp(node.state.feedback, 0, 1)}
          onChange={(v) => onPatchNode(node.id, { feedback: v })}
          min={0}
          max={1}
          label="FB"
          format={(v) => v.toFixed(2)}
          onDragStart={startBatch}
          onDragEnd={endBatch}
        />
      </div>
    </ThemeProvider>
  );
};

export const pmSinGraph: NodeDefinition<PmSinNode> = {
  type: "pmSin",
  title: "Sin",
  defaultState,
  ports: () => [
    { id: "phase_in", name: "Phase", kind: "audio", direction: "in" },
    { id: "audio_out", name: "Audio", kind: "audio", direction: "out" },
  ],
  ui: PmSinUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<PmSinNode["state"]>;
    const d = defaultState();
    return { feedback: clamp(s.feedback ?? d.feedback, 0, 1) };
  },
};

