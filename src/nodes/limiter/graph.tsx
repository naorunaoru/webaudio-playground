import type { GraphNode } from "@graph/types";
import type { NodeDefinition, NodeUiProps } from "@/types/graphNodeDefinition";
import { Knob, RadioGroup } from "@ui/components";
import { clamp } from "@utils/math";

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

const LimiterUi: React.FC<NodeUiProps<LimiterNode>> = ({ node, onPatchNode }) => {
  const ceilingDb = clamp(node.state.ceilingDb, -60, 0);
  const releaseMs = clamp(node.state.releaseMs, 1, 5000);
  const makeupDb = clamp(node.state.makeupDb, -24, 24);
  const stereoLink = !!node.state.stereoLink;
  const bypass = !!node.state.bypass;
  const channelCount = node.state.channelCount === 1 ? 1 : 2;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
        <RadioGroup
          value={channelCount}
          onChange={(v) => onPatchNode(node.id, { channelCount: v as 1 | 2 })}
          options={[
            { value: 1, content: "Mono" },
            { value: 2, content: "Stereo" },
          ]}
          label="Channels"
        />
        <RadioGroup
          value={stereoLink ? "on" : "off"}
          onChange={(v) => onPatchNode(node.id, { stereoLink: v === "on" })}
          options={[
            { value: "on", content: "On" },
            { value: "off", content: "Off" },
          ]}
          label="Link"
          disabled={channelCount === 1}
        />
      </div>

      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <Knob
          value={ceilingDb}
          onChange={(v) => onPatchNode(node.id, { ceilingDb: v })}
          min={-30}
          max={0}
          label="Ceiling"
          indicator="arc"
          format={(v) => v.toFixed(1)}
          unit="dB"
        />
        <Knob
          value={releaseMs}
          onChange={(v) => onPatchNode(node.id, { releaseMs: v })}
          min={5}
          max={2000}
          label="Release"
          indicator="arc"
          format={(v) => Math.round(v).toString()}
          unit="ms"
        />
        <Knob
          value={makeupDb}
          onChange={(v) => onPatchNode(node.id, { makeupDb: v })}
          min={-12}
          max={12}
          label="Makeup"
          indicator="bipolar"
          format={(v) => v.toFixed(1)}
          unit="dB"
        />
      </div>

      <div style={{ display: "flex", justifyContent: "center" }}>
        <RadioGroup
          value={bypass ? "on" : "off"}
          onChange={(v) => onPatchNode(node.id, { bypass: v === "on" })}
          options={[
            { value: "off", content: "Active" },
            { value: "on", content: "Bypass" },
          ]}
          label="Bypass"
        />
      </div>
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
