import type { GraphNode } from "../../graph/types";
import type { NodeDefinition, NodeUiProps } from "../../types/graphNodeDefinition";

type LimiterNode = Extract<GraphNode, { type: "limiter" }>;

function defaultState(): LimiterNode["state"] {
  return {
    ceilingDb: -0.3,
    releaseMs: 120,
    makeupDb: 0,
    bypass: false,
    stereoLink: true,
    channelCount: 2,
    lookaheadMs: 0,
  };
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

type LimiterDebug = {
  module?: "loading" | "ready" | "error";
  worklet?: "none" | "ready" | "error";
  wasm?: "provided" | "missing" | "loading" | "ready" | "error";
};

function isLimiterDebug(v: unknown): v is LimiterDebug {
  return !!v && typeof v === "object";
}

const LimiterUi: React.FC<NodeUiProps<LimiterNode>> = ({ node, onPatchNode, debug }) => {
  const ceilingDb = clamp(node.state.ceilingDb, -60, 0);
  const releaseMs = clamp(node.state.releaseMs, 1, 5000);
  const makeupDb = clamp(node.state.makeupDb, -24, 24);
  const stereoLink = !!node.state.stereoLink;
  const bypass = !!node.state.bypass;
  const channelCount = node.state.channelCount === 1 ? 1 : 2;
  const d = isLimiterDebug(debug) ? debug : null;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div
        style={{
          display: "grid",
          gap: 2,
          padding: "6px 8px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(0,0,0,0.18)",
          fontSize: 11,
          opacity: 0.85,
        }}
      >
        <div>Worklet: {d?.worklet ?? "…"}</div>
        <div>WASM: {d?.wasm ?? "…"}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>Channels</span>
          <select
            value={channelCount}
            onChange={(e) => onPatchNode(node.id, { channelCount: Number(e.target.value) as 1 | 2 })}
          >
            <option value={1}>mono</option>
            <option value={2}>stereo</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>Stereo link</span>
          <input
            type="checkbox"
            checked={stereoLink}
            onChange={(e) => onPatchNode(node.id, { stereoLink: e.target.checked })}
            disabled={channelCount === 1}
          />
        </label>
      </div>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, opacity: 0.75 }}>Ceiling: {ceilingDb.toFixed(1)} dB</span>
        <input
          type="range"
          min={-30}
          max={0}
          step={0.1}
          value={ceilingDb}
          onInput={(e) => onPatchNode(node.id, { ceilingDb: Number((e.target as HTMLInputElement).value) })}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, opacity: 0.75 }}>Release: {Math.round(releaseMs)} ms</span>
        <input
          type="range"
          min={5}
          max={2000}
          step={1}
          value={releaseMs}
          onInput={(e) => onPatchNode(node.id, { releaseMs: Number((e.target as HTMLInputElement).value) })}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, opacity: 0.75 }}>Makeup: {makeupDb.toFixed(1)} dB</span>
        <input
          type="range"
          min={-12}
          max={12}
          step={0.1}
          value={makeupDb}
          onInput={(e) => onPatchNode(node.id, { makeupDb: Number((e.target as HTMLInputElement).value) })}
        />
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={bypass}
          onChange={(e) => onPatchNode(node.id, { bypass: e.target.checked })}
        />
        <span style={{ fontSize: 12, opacity: 0.75 }}>Bypass</span>
      </label>
    </div>
  );
};

export const limiterGraph: NodeDefinition<LimiterNode> = {
  type: "limiter",
  title: "Limiter",
  defaultState,
  ports: () => [
    { id: "audio_in", name: "In", kind: "audio", direction: "in" },
    { id: "audio_out", name: "Out", kind: "audio", direction: "out" },
  ],
  ui: LimiterUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<LimiterNode["state"]>;
    const d = defaultState();
    const channelCount = s.channelCount === 1 ? 1 : 2;
    return {
      ceilingDb: s.ceilingDb ?? d.ceilingDb,
      releaseMs: s.releaseMs ?? d.releaseMs,
      makeupDb: s.makeupDb ?? d.makeupDb,
      bypass: s.bypass ?? d.bypass,
      stereoLink: s.stereoLink ?? d.stereoLink,
      channelCount,
      lookaheadMs: 0,
    };
  },
};
