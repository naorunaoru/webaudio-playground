import type { GraphNode } from "../../graph/types";
import type { NodeDefinition, NodeUiProps } from "../../types/graphNodeDefinition";

type GainNodeGraph = Extract<GraphNode, { type: "gain" }>;

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function defaultState(): GainNodeGraph["state"] {
  return { depth: 1 };
}

const GainUi: React.FC<NodeUiProps<GainNodeGraph>> = ({ node, onPatchNode }) => {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, opacity: 0.75 }}>Depth: {node.state.depth.toFixed(2)}</span>
        <input
          type="range"
          min={0}
          max={2}
          step={0.01}
          value={node.state.depth}
          onInput={(e) =>
            onPatchNode(node.id, { depth: Number((e.target as HTMLInputElement).value) })
          }
        />
      </label>
    </div>
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
    const s = (state ?? {}) as Partial<GainNodeGraph["state"]>;
    const d = defaultState();
    return { depth: clamp(s.depth ?? d.depth, 0, 2) };
  },
};

