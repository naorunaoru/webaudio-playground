import type { GraphNode } from "@graph/types";
import type { NodeDefinition, NodeUiProps } from "@/types/graphNodeDefinition";
import { Knob } from "@/ui/components";
import { ThemeProvider } from "@/ui/context";
import type { ControlTheme } from "@/ui/types/theme";
import { clamp } from "@/utils/math";

type PmPhasorNode = Extract<GraphNode, { type: "pmPhasor" }>;

const phasorTheme: ControlTheme = {
  primary: "#38bdf8", // Sky
  secondary: "#7dd3fc",
  tertiary: "#0ea5e9",
};

function defaultState(): PmPhasorNode["state"] {
  return { resetThreshold: 0.5 };
}

const PmPhasorUi: React.FC<NodeUiProps<PmPhasorNode>> = ({ node, onPatchNode, startBatch, endBatch }) => {
  return (
    <ThemeProvider theme={phasorTheme}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Knob
          value={clamp(node.state.resetThreshold, 0, 1)}
          onChange={(v) => onPatchNode(node.id, { resetThreshold: v })}
          min={0}
          max={1}
          label="Reset"
          format={(v) => v.toFixed(2)}
          onDragStart={startBatch}
          onDragEnd={endBatch}
        />
      </div>
    </ThemeProvider>
  );
};

export const pmPhasorGraph: NodeDefinition<PmPhasorNode> = {
  type: "pmPhasor",
  title: "Phasor",
  defaultState,
  ports: () => [
    { id: "freq_in", name: "Hz", kind: "automation", direction: "in" },
    { id: "reset_in", name: "Rst", kind: "automation", direction: "in" },
    { id: "phase_out", name: "Phase", kind: "audio", direction: "out" },
  ],
  ui: PmPhasorUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<PmPhasorNode["state"]>;
    const d = defaultState();
    return { resetThreshold: clamp(s.resetThreshold ?? d.resetThreshold, 0, 1) };
  },
};

