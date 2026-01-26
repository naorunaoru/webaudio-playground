import type { GraphNode } from "@graph/types";
import type { NodeDefinition, NodeUiProps } from "@/types/graphNodeDefinition";
import { Knob } from "@/ui/components/Knob";
import { ThemeProvider } from "@/ui/context";
import type { ControlTheme } from "@/ui/types/theme";
import { clamp } from "@/utils/math";

const pitchRatioTheme: ControlTheme = {
  primary: "#ec4899", // Pink - ratio/harmony
  secondary: "#f472b6",
  tertiary: "#db2777",
};

type PitchRatioNodeGraph = Extract<GraphNode, { type: "pitchRatio" }>;

function defaultState(): PitchRatioNodeGraph["state"] {
  return { numerator: 1, denominator: 1 };
}

const PitchRatioUi: React.FC<NodeUiProps<PitchRatioNodeGraph>> = ({
  node,
  onPatchNode,
  startBatch,
  endBatch,
}) => {
  return (
    <ThemeProvider theme={pitchRatioTheme}>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <Knob
          value={node.state.numerator}
          onChange={(v) => onPatchNode(node.id, { numerator: Math.round(v) })}
          min={1}
          max={16}
          label="Num"
          format={(v) => Math.round(v).toString()}
          onDragStart={startBatch}
          onDragEnd={endBatch}
        />
        <Knob
          value={node.state.denominator}
          onChange={(v) => onPatchNode(node.id, { denominator: Math.round(v) })}
          min={1}
          max={16}
          label="Denom"
          format={(v) => Math.round(v).toString()}
          onDragStart={startBatch}
          onDragEnd={endBatch}
        />
      </div>
    </ThemeProvider>
  );
};

export const pitchRatioGraph: NodeDefinition<PitchRatioNodeGraph> = {
  type: "pitchRatio",
  title: "Ratio",
  defaultState,
  ports: () => [
    { id: "pitch_in", name: "In", kind: "pitch", direction: "in" },
    { id: "pitch_out", name: "Out", kind: "pitch", direction: "out" },
  ],
  ui: PitchRatioUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<PitchRatioNodeGraph["state"]>;
    const d = defaultState();
    return {
      numerator: Math.round(clamp(s.numerator ?? d.numerator, 1, 16)),
      denominator: Math.round(clamp(s.denominator ?? d.denominator, 1, 16)),
    };
  },
};
