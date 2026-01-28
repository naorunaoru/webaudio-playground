import type { GraphNode } from "@graph/types";
import type { NodeDefinition, NodeUiProps } from "@/types/graphNodeDefinition";
import { Knob } from "@ui/components/Knob";
import { ThemeProvider } from "@ui/context";
import type { ControlTheme } from "@ui/types/theme";
import { clamp } from "@utils/math";

const microDelayTheme: ControlTheme = {
  primary: "#8b5cf6", // Purple - precision timing
  secondary: "#a78bfa",
  tertiary: "#7c3aed",
};

type MicroDelayNode = Extract<GraphNode, { type: "microDelay" }>;

function defaultState(): MicroDelayNode["state"] {
  return { delayMs: 0.02 }; // ~1 sample at 48kHz
}

const MicroDelayUi: React.FC<NodeUiProps<MicroDelayNode>> = ({
  node,
  onPatchNode,
  startBatch,
  endBatch,
}) => {
  const delayMs = clamp(node.state.delayMs, 0.01, 50);

  // Format: show microseconds for very small values, milliseconds otherwise
  const format = (v: number) => {
    if (v < 1) {
      return `${(v * 1000).toFixed(0)} µs`;
    }
    return `${v.toFixed(1)} ms`;
  };

  return (
    <ThemeProvider theme={microDelayTheme}>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <Knob
          value={delayMs}
          onChange={(v) => onPatchNode(node.id, { delayMs: v })}
          min={0.01}
          max={50}
          label="Time"
          format={format}
          // logarithmic ?
          onDragStart={startBatch}
          onDragEnd={endBatch}
        />
      </div>
    </ThemeProvider>
  );
};

export const microDelayGraph: NodeDefinition<MicroDelayNode> = {
  type: "microDelay",
  title: "µDelay",
  defaultState,
  ports: () => [
    { id: "audio_in", name: "In", kind: "audio", direction: "in" },
    { id: "audio_out", name: "Out", kind: "audio", direction: "out" },
  ],
  ui: MicroDelayUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<MicroDelayNode["state"]>;
    const d = defaultState();
    return {
      delayMs: s.delayMs ?? d.delayMs,
    };
  },
};
