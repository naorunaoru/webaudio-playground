import type { GraphNode } from "../../graph/types";
import type {
  NodeDefinition,
  NodeUiProps,
} from "../../types/graphNodeDefinition";
import { Knob } from "../../ui/components/Knob";
import { ThemeProvider } from "../../ui/context";
import type { ControlTheme } from "../../ui/types/theme";

const reverbTheme: ControlTheme = {
  primary: "#14b8a6",
  secondary: "#2dd4bf",
  tertiary: "#0d9488",
};

type ReverbNode = Extract<GraphNode, { type: "reverb" }>;

function defaultState(): ReverbNode["state"] {
  return {
    seconds: 2.2,
    decay: 3.5,
    preDelayMs: 18,
    mix: 0.35,
    reverse: false,
  };
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

const ReverbUi: React.FC<NodeUiProps<ReverbNode>> = ({ node, onPatchNode, startBatch, endBatch }) => {
  const seconds = clamp(node.state.seconds, 0.1, 10);
  const decay = clamp(node.state.decay, 0.1, 20);
  const preDelayMs = clamp(node.state.preDelayMs, 0, 1000);
  const mix = clamp(node.state.mix, 0, 1);
  const reverse = !!node.state.reverse;

  return (
    <ThemeProvider theme={reverbTheme}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <Knob
            value={mix}
            onChange={(v) => onPatchNode(node.id, { mix: v })}
            min={0}
            max={1}
            label="Mix"
            format={(v) => `${Math.round(v * 100)}%`}
            onDragStart={startBatch}
            onDragEnd={endBatch}
          />
          <Knob
            value={seconds}
            onChange={(v) => onPatchNode(node.id, { seconds: v })}
            min={0.1}
            max={10}
            label="Time"
            unit="s"
            onDragStart={startBatch}
            onDragEnd={endBatch}
          />
          <Knob
            value={decay}
            onChange={(v) => onPatchNode(node.id, { decay: v })}
            min={0.1}
            max={20}
            label="Decay"
            onDragStart={startBatch}
            onDragEnd={endBatch}
          />
          <Knob
            value={preDelayMs}
            onChange={(v) => onPatchNode(node.id, { preDelayMs: v })}
            min={0}
            max={250}
            label="Pre-dly"
            format={(v) => Math.round(v).toString()}
            unit="ms"
            onDragStart={startBatch}
            onDragEnd={endBatch}
          />
        </div>

        <label
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <input
            type="checkbox"
            checked={reverse}
            onChange={(e) =>
              onPatchNode(node.id, { reverse: e.target.checked })
            }
          />
          <span style={{ fontSize: 12, opacity: 0.75 }}>Reverse</span>
        </label>
      </div>
    </ThemeProvider>
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
