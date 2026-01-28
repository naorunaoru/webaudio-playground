import type { GraphNode } from "@graph/types";
import type { NodeDefinition, NodeUiProps } from "@/types/graphNodeDefinition";
import { Knob } from "@ui/components/Knob";
import { ThemeProvider } from "@ui/context";
import type { ControlTheme } from "@ui/types/theme";
import { ms, percent } from "@ui/units";
import { clamp } from "@utils/math";

const delayTheme: ControlTheme = {
  primary: "#f59e0b", // Amber - warm echo
  secondary: "#fbbf24",
  tertiary: "#d97706",
};

type DelayNode = Extract<GraphNode, { type: "delay" }>;

function defaultState(): DelayNode["state"] {
  return { delayMs: 240, feedback: 0.35, mix: 0.5 };
}

const DelayUi: React.FC<NodeUiProps<DelayNode>> = ({ node, onPatchNode, connectedPorts, startBatch, endBatch }) => {
  const delayMs = clamp(node.state.delayMs, 0, 5000);
  const feedback = clamp(node.state.feedback, 0, 0.98);
  const mix = clamp(node.state.mix, 0, 1);

  const hasExternalFeedback = connectedPorts?.has("feedback_return") ?? false;

  return (
    <ThemeProvider theme={delayTheme}>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <Knob
          value={delayMs}
          onChange={(v) => onPatchNode(node.id, { delayMs: v })}
          min={0}
          max={1500}
          label="Time"
          unit={ms}
          onDragStart={startBatch}
          onDragEnd={endBatch}
        />
        <Knob
          value={feedback}
          onChange={(v) => onPatchNode(node.id, { feedback: v })}
          min={0}
          max={0.98}
          label={hasExternalFeedback ? "Return" : "Feedback"}
          unit={percent}
          onDragStart={startBatch}
          onDragEnd={endBatch}
        />
        <Knob
          value={mix}
          onChange={(v) => onPatchNode(node.id, { mix: v })}
          min={0}
          max={1}
          label="Mix"
          unit={percent}
          onDragStart={startBatch}
          onDragEnd={endBatch}
        />
      </div>
    </ThemeProvider>
  );
};

export const delayGraph: NodeDefinition<DelayNode> = {
  type: "delay",
  title: "Delay",
  defaultState,
  ports: () => [
    { id: "audio_in", name: "In", kind: "audio", direction: "in" },
    { id: "audio_out", name: "Out", kind: "audio", direction: "out" },
    { id: "feedback_send", name: "FB Send", kind: "audio", direction: "out" },
    { id: "feedback_return", name: "FB Return", kind: "audio", direction: "in" },
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
