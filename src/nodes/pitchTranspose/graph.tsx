import type { GraphNode } from "@graph/types";
import type { NodeDefinition, NodeUiProps } from "@/types/graphNodeDefinition";
import { Knob } from "@/ui/components/Knob";
import { ThemeProvider } from "@/ui/context";
import type { ControlTheme } from "@/ui/types/theme";
import { clamp } from "@/utils/math";

const pitchTransposeTheme: ControlTheme = {
  primary: "#8b5cf6", // Purple - pitch/frequency
  secondary: "#a78bfa",
  tertiary: "#7c3aed",
};

type PitchTransposeNodeGraph = Extract<GraphNode, { type: "pitchTranspose" }>;

function defaultState(): PitchTransposeNodeGraph["state"] {
  return { semitones: 0 };
}

const PitchTransposeUi: React.FC<NodeUiProps<PitchTransposeNodeGraph>> = ({
  node,
  onPatchNode,
  startBatch,
  endBatch,
}) => {
  return (
    <ThemeProvider theme={pitchTransposeTheme}>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <Knob
          value={node.state.semitones}
          onChange={(v) => onPatchNode(node.id, { semitones: Math.round(v) })}
          min={-24}
          max={24}
          label="Semi"
          format={(v) => {
            const rounded = Math.round(v);
            return rounded > 0 ? `+${rounded}` : `${rounded}`;
          }}
          onDragStart={startBatch}
          onDragEnd={endBatch}
        />
      </div>
    </ThemeProvider>
  );
};

export const pitchTransposeGraph: NodeDefinition<PitchTransposeNodeGraph> = {
  type: "pitchTranspose",
  title: "Transpose",
  defaultState,
  ports: () => [
    { id: "pitch_in", name: "In", kind: "pitch", direction: "in" },
    { id: "pitch_out", name: "Out", kind: "pitch", direction: "out" },
  ],
  ui: PitchTransposeUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<PitchTransposeNodeGraph["state"]>;
    const d = defaultState();
    return {
      semitones: Math.round(clamp(s.semitones ?? d.semitones, -24, 24)),
    };
  },
};
