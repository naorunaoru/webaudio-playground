import type { GraphNode } from "../../graph/types";
import type { NodeDefinition, NodeUiProps } from "../../types/graphNodeDefinition";
import { Knob } from "../../ui/components/Knob";
import { ThemeProvider } from "../../ui/context";
import type { ControlTheme } from "../../ui/types/theme";

const gainTheme: ControlTheme = {
  primary: "#22c55e", // Green - level/volume
  secondary: "#4ade80",
  tertiary: "#16a34a",
};

type GainNodeGraph = Extract<GraphNode, { type: "gain" }>;

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function defaultState(): GainNodeGraph["state"] {
  return { base: 0, depth: 1 };
}

const GainUi: React.FC<NodeUiProps<GainNodeGraph>> = ({ node, onPatchNode, startBatch, endBatch }) => {
  return (
    <ThemeProvider theme={gainTheme}>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <Knob
          value={node.state.base}
          onChange={(v) => onPatchNode(node.id, { base: v })}
          min={0}
          max={2}
          label="Base"
          format={(v) => v.toFixed(2)}
          onDragStart={startBatch}
          onDragEnd={endBatch}
        />
        <Knob
          value={node.state.depth}
          onChange={(v) => onPatchNode(node.id, { depth: v })}
          min={0}
          max={2}
          label="CV"
          format={(v) => v.toFixed(2)}
          onDragStart={startBatch}
          onDragEnd={endBatch}
        />
      </div>
    </ThemeProvider>
  );
};

export const gainGraph: NodeDefinition<GainNodeGraph> = {
  type: "gain",
  title: "Gain",
  defaultState,
  ports: () => [
    { id: "audio_in", name: "In", kind: "audio", direction: "in" },
    { id: "gain_in", name: "Gain", kind: "automation", direction: "in" },
    { id: "audio_out", name: "Out", kind: "audio", direction: "out" },
  ],
  ui: GainUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<GainNodeGraph["state"]> & { gain?: unknown };
    const d = defaultState();
    return {
      base: clamp(s.base ?? d.base, 0, 2),
      depth: clamp(s.depth ?? d.depth, 0, 2),
    };
  },
};
