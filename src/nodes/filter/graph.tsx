import type { GraphNode } from "../../graph/types";
import type { NodeDefinition, NodeUiProps } from "../../types/graphNodeDefinition";
import type { FilterType } from "./types";

type FilterNodeGraph = Extract<GraphNode, { type: "filter" }>;

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function clampPositive(v: number, fallback: number): number {
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return v;
}

function hzFromNorm(t: number): number {
  const min = 20;
  const max = 20000;
  const clamped = clamp(t, 0, 1);
  return min * Math.pow(max / min, clamped);
}

function normFromHz(hz: number): number {
  const min = 20;
  const max = 20000;
  const clamped = clamp(hz, min, max);
  return Math.log(clamped / min) / Math.log(max / min);
}

function defaultState(): FilterNodeGraph["state"] {
  return {
    type: "lowpass",
    frequencyHz: 1200,
    q: 0.7,
    envAmountHz: 0,
  };
}

const FilterUi: React.FC<NodeUiProps<FilterNodeGraph>> = ({ node, onPatchNode }) => {
  const freqNorm = normFromHz(node.state.frequencyHz);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, opacity: 0.75 }}>Type</span>
        <select
          value={node.state.type}
          onChange={(e) =>
            onPatchNode(node.id, { type: e.target.value as FilterType })
          }
        >
          <option value="lowpass">lowpass</option>
          <option value="highpass">highpass</option>
        </select>
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, opacity: 0.75 }}>
          Frequency: {Math.round(node.state.frequencyHz)} Hz
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={freqNorm}
          onInput={(e) =>
            onPatchNode(node.id, {
              frequencyHz: hzFromNorm(Number((e.target as HTMLInputElement).value)),
            })
          }
        />
        <input
          type="number"
          min={20}
          max={20000}
          step={1}
          value={Math.round(node.state.frequencyHz)}
          onChange={(e) =>
            onPatchNode(node.id, { frequencyHz: Number(e.target.value) })
          }
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, opacity: 0.75 }}>Q: {node.state.q.toFixed(2)}</span>
        <input
          type="range"
          min={0.0001}
          max={30}
          step={0.0001}
          value={node.state.q}
          onInput={(e) =>
            onPatchNode(node.id, { q: Number((e.target as HTMLInputElement).value) })
          }
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, opacity: 0.75 }}>
          Env Amount: {Math.round(node.state.envAmountHz)} Hz
        </span>
        <input
          type="range"
          min={0}
          max={20000}
          step={1}
          value={node.state.envAmountHz}
          onInput={(e) =>
            onPatchNode(node.id, { envAmountHz: Number((e.target as HTMLInputElement).value) })
          }
        />
      </label>
    </div>
  );
};

export const filterGraph: NodeDefinition<FilterNodeGraph> = {
  type: "filter",
  title: "Filter",
  defaultState,
  ports: () => [
    { id: "audio_in", name: "In", kind: "audio", direction: "in" },
    { id: "freq_in", name: "Freq", kind: "automation", direction: "in" },
    { id: "audio_out", name: "Out", kind: "audio", direction: "out" },
  ],
  ui: FilterUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<FilterNodeGraph["state"]>;
    const d = defaultState();
    const type: FilterType = (s.type ?? d.type) === "highpass" ? "highpass" : "lowpass";
    return {
      type,
      frequencyHz: clamp(clampPositive(s.frequencyHz ?? d.frequencyHz, d.frequencyHz), 20, 20000),
      q: clamp(clampPositive(s.q ?? d.q, d.q), 0.0001, 30),
      envAmountHz: clamp(s.envAmountHz ?? d.envAmountHz, 0, 20000),
    };
  },
};

