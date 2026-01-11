import type { GraphNode } from "@graph/types";
import type { NodeDefinition, NodeUiProps } from "@/types/graphNodeDefinition";
import { Knob, RadioGroup } from "@/ui/components";
import { ThemeProvider } from "@/ui/context";
import type { ControlTheme, OptionDef } from "@/ui/types";
import { clamp } from "@/utils/math";

type PmOscillatorNode = Extract<GraphNode, { type: "pmOscillator" }>;

const pmTheme: ControlTheme = {
  primary: "#a78bfa", // Violet
  secondary: "#c4b5fd",
  tertiary: "#8b5cf6",
};

function defaultState(): PmOscillatorNode["state"] {
  return {
    ratio: 1,
    detuneCents: 0,
    feedback: 0,
    resetPhaseOnNoteOn: true,
  };
}

const resetOptions: OptionDef<"on" | "off">[] = [
  { value: "on", content: "On", ariaLabel: "Reset phase on note-on: on" },
  { value: "off", content: "Off", ariaLabel: "Reset phase on note-on: off" },
];

const PmOscillatorUi: React.FC<NodeUiProps<PmOscillatorNode>> = ({ node, onPatchNode, startBatch, endBatch }) => {
  const ratio = clamp(node.state.ratio, 0.25, 16);
  const detuneCents = clamp(node.state.detuneCents, -1200, 1200);
  const feedback = clamp(node.state.feedback, 0, 1);
  const reset = node.state.resetPhaseOnNoteOn ? "on" : "off";

  return (
    <ThemeProvider theme={pmTheme}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <Knob
            value={ratio}
            onChange={(v) => onPatchNode(node.id, { ratio: v })}
            min={0.25}
            max={16}
            label="Ratio"
            format={(v) => v.toFixed(2)}
            onDragStart={startBatch}
            onDragEnd={endBatch}
          />
          <Knob
            value={detuneCents}
            onChange={(v) => onPatchNode(node.id, { detuneCents: v })}
            min={-1200}
            max={1200}
            label="Detune"
            format={(v) => Math.round(v).toString()}
            unit="c"
            onDragStart={startBatch}
            onDragEnd={endBatch}
          />
          <Knob
            value={feedback}
            onChange={(v) => onPatchNode(node.id, { feedback: v })}
            min={0}
            max={1}
            label="FB"
            format={(v) => v.toFixed(2)}
            onDragStart={startBatch}
            onDragEnd={endBatch}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <RadioGroup
            value={reset}
            onChange={(v) => onPatchNode(node.id, { resetPhaseOnNoteOn: v === "on" })}
            options={resetOptions}
            label="Reset"
          />
        </div>
      </div>
    </ThemeProvider>
  );
};

export const pmOscillatorGraph: NodeDefinition<PmOscillatorNode> = {
  type: "pmOscillator",
  title: "PM Osc",
  defaultState,
  ports: () => [
    { id: "midi_in", name: "MIDI", kind: "midi", direction: "in" },
    { id: "phase_in", name: "PM", kind: "audio", direction: "in" },
    { id: "audio_out", name: "Audio", kind: "audio", direction: "out" },
  ],
  ui: PmOscillatorUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<PmOscillatorNode["state"]>;
    const d = defaultState();
    return {
      ratio: clamp(s.ratio ?? d.ratio, 0.25, 16),
      detuneCents: clamp(s.detuneCents ?? d.detuneCents, -1200, 1200),
      feedback: clamp(s.feedback ?? d.feedback, 0, 1),
      resetPhaseOnNoteOn: (s.resetPhaseOnNoteOn ?? d.resetPhaseOnNoteOn) === true,
    };
  },
};

