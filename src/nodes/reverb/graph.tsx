import type { GraphNode } from "../../graph/types";
import type { NodeDefinition, NodeUiProps } from "../../types/graphNodeDefinition";

type ReverbNode = Extract<GraphNode, { type: "reverb" }>;

function defaultState(): ReverbNode["state"] {
  return { seconds: 2.2, decay: 3.5, preDelayMs: 18, mix: 0.35, reverse: false };
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

const ReverbUi: React.FC<NodeUiProps<ReverbNode>> = ({ node, onPatchNode }) => {
  const seconds = clamp(node.state.seconds, 0.1, 10);
  const decay = clamp(node.state.decay, 0.1, 20);
  const preDelayMs = clamp(node.state.preDelayMs, 0, 1000);
  const mix = clamp(node.state.mix, 0, 1);
  const reverse = !!node.state.reverse;

  return (
    <div style={{ display: "grid", gap: 10 }}>
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

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, opacity: 0.75 }}>Time: {seconds.toFixed(2)} s</span>
        <input
          type="range"
          min={10}
          max={1000}
          value={Math.round(seconds * 100)}
          onInput={(e) => onPatchNode(node.id, { seconds: Number((e.target as HTMLInputElement).value) / 100 })}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, opacity: 0.75 }}>Decay: {decay.toFixed(2)}</span>
        <input
          type="range"
          min={10}
          max={2000}
          value={Math.round(decay * 100)}
          onInput={(e) => onPatchNode(node.id, { decay: Number((e.target as HTMLInputElement).value) / 100 })}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, opacity: 0.75 }}>Pre-delay: {Math.round(preDelayMs)} ms</span>
        <input
          type="range"
          min={0}
          max={250}
          value={Math.round(preDelayMs)}
          onInput={(e) => onPatchNode(node.id, { preDelayMs: Number((e.target as HTMLInputElement).value) })}
        />
      </label>

      <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={reverse}
          onChange={(e) => onPatchNode(node.id, { reverse: e.target.checked })}
        />
        <span style={{ fontSize: 12, opacity: 0.75 }}>Reverse</span>
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 11, opacity: 0.65 }}>Time (s)</span>
          <input
            type="number"
            min={0.1}
            max={10}
            step={0.01}
            value={Number(seconds.toFixed(2))}
            onChange={(e) => onPatchNode(node.id, { seconds: Number(e.target.value) })}
          />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 11, opacity: 0.65 }}>Decay</span>
          <input
            type="number"
            min={0.1}
            max={20}
            step={0.01}
            value={Number(decay.toFixed(2))}
            onChange={(e) => onPatchNode(node.id, { decay: Number(e.target.value) })}
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

export const reverbGraph: NodeDefinition<ReverbNode> = {
  type: "reverb",
  title: "Reverb",
  defaultState,
  ports: () => [
    { id: "audio_in", name: "In", kind: "audio", direction: "in" },
    { id: "audio_out", name: "Out", kind: "audio", direction: "out" },
  ],
  ui: ReverbUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<ReverbNode["state"]>;
    const d = defaultState();
    return {
      seconds: s.seconds ?? d.seconds,
      decay: s.decay ?? d.decay,
      preDelayMs: s.preDelayMs ?? d.preDelayMs,
      mix: s.mix ?? d.mix,
      reverse: s.reverse ?? d.reverse,
    };
  },
};

