import type { GraphNode } from "../../graph/types";
import type { NodeDefinition, NodeUiProps } from "../../types/graphNodeDefinition";

type CcSourceNode = Extract<GraphNode, { type: "ccSource" }>;

function defaultState(): CcSourceNode["state"] {
  return { controller: 1, value: 0, channel: 1, lastSentAtMs: null };
}

const CcSourceUi: React.FC<NodeUiProps<CcSourceNode>> = ({ node, onPatchNode, onEmitMidi }) => {
  const send = async (patch: Partial<CcSourceNode["state"]>) => {
    const next = { ...node.state, ...patch };
    onPatchNode(node.id, patch);
    const atMs = performance.now();
    await onEmitMidi?.(node.id, {
      type: "cc",
      controller: Math.max(0, Math.min(127, Math.floor(next.controller))),
      value: Math.max(0, Math.min(127, Math.floor(next.value))),
      channel: Math.max(1, Math.min(16, Math.floor(next.channel))),
      atMs,
    });
    onPatchNode(node.id, { lastSentAtMs: atMs });
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>CC#</span>
          <input
            type="number"
            min={0}
            max={127}
            value={node.state.controller}
            onChange={(e) => void send({ controller: Number(e.target.value) })}
          />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>Ch</span>
          <input
            type="number"
            min={1}
            max={16}
            value={node.state.channel}
            onChange={(e) => void send({ channel: Number(e.target.value) })}
          />
        </label>
      </div>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, opacity: 0.75 }}>Value: {node.state.value}</span>
        <input
          type="range"
          min={0}
          max={127}
          value={node.state.value}
          onInput={(e) =>
            void send({ value: Number((e.target as HTMLInputElement).value) })
          }
        />
      </label>
    </div>
  );
};

export const ccSourceGraph: NodeDefinition<CcSourceNode> = {
  type: "ccSource",
  title: "CC Source",
  defaultState,
  ports: () => [{ id: "cc_out", name: "CC", kind: "cc", direction: "out" }],
  ui: CcSourceUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<CcSourceNode["state"]>;
    const d = defaultState();
    return {
      controller: s.controller ?? d.controller,
      value: s.value ?? d.value,
      channel: s.channel ?? d.channel,
      lastSentAtMs: s.lastSentAtMs ?? d.lastSentAtMs,
    };
  },
};
