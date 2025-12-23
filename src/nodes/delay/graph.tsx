import type { GraphNode } from "../../graph/types";
import type { NodeDefinition, NodeUiProps } from "../../types/graphNodeDefinition";

type DelayNode = Extract<GraphNode, { type: "delay" }>;

function defaultState(): DelayNode["state"] {
  return { delayMs: 240, feedback: 0.35, mix: 0.5 };
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

const DelayUi: React.FC<NodeUiProps<DelayNode>> = ({ node, onPatchNode }) => {
  const delayMs = clamp(node.state.delayMs, 0, 5000);
  const feedback = clamp(node.state.feedback, 0, 0.98);
  const mix = clamp(node.state.mix, 0, 1);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, opacity: 0.75 }}>Speed (delay): {Math.round(delayMs)} ms</span>
        <input
          type="range"
          min={0}
          max={1500}
          value={delayMs}
          onInput={(e) => onPatchNode(node.id, { delayMs: Number((e.target as HTMLInputElement).value) })}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, opacity: 0.75 }}>
          Decay (feedback): {Math.round(feedback * 100)}%
        </span>
        <input
          type="range"
          min={0}
          max={98}
          value={Math.round(feedback * 100)}
          onInput={(e) => onPatchNode(node.id, { feedback: Number((e.target as HTMLInputElement).value) / 100 })}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, opacity: 0.75 }}>Mix: {Math.round(mix * 100)}%</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(mix * 100)}
          onInput={(e) => onPatchNode(node.id, { mix: Number((e.target as HTMLInputElement).value) / 100 })}
        />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 11, opacity: 0.65 }}>Delay (ms)</span>
          <input
            type="number"
            min={0}
            max={5000}
            value={Math.round(delayMs)}
            onChange={(e) => onPatchNode(node.id, { delayMs: Number(e.target.value) })}
          />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 11, opacity: 0.65 }}>Feedback</span>
          <input
            type="number"
            min={0}
            max={0.98}
            step={0.01}
            value={Number(feedback.toFixed(2))}
            onChange={(e) => onPatchNode(node.id, { feedback: Number(e.target.value) })}
          />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 11, opacity: 0.65 }}>Mix</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={Number(mix.toFixed(2))}
            onChange={(e) => onPatchNode(node.id, { mix: Number(e.target.value) })}
          />
        </label>
      </div>
    </div>
  );
};

export const delayGraph: NodeDefinition<DelayNode> = {
  type: "delay",
  title: "Delay",
  defaultState,
  ports: () => [
    { id: "audio_in", name: "In", kind: "audio", direction: "in" },
    { id: "audio_out", name: "Out", kind: "audio", direction: "out" },
  ],
  ui: DelayUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<DelayNode["state"]>;
    const d = defaultState();
    return {
      delayMs: s.delayMs ?? d.delayMs,
      feedback: s.feedback ?? d.feedback,
      mix: s.mix ?? d.mix,
    };
  },
};
