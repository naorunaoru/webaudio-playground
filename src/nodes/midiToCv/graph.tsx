import type { GraphNode } from "@graph/types";
import type { NodeDefinition, NodeUiProps } from "@/types/graphNodeDefinition";
import type { MidiToCvMode } from "./types";
import type { OptionDef } from "@ui/types";
import { NumericInput } from "@ui/components/NumericInput";
import { RadioGroup } from "@ui/components/RadioGroup";
import { Knob } from "@ui/components/Knob";
import { ms } from "@ui/units";

type MidiToCvNode = Extract<GraphNode, { type: "midiToCv" }>;

function defaultState(): MidiToCvNode["state"] {
  return { mode: "polyphony", voiceCount: 8, portamentoMs: 50, channel: 0 };
}

const modeOptions: OptionDef<MidiToCvMode>[] = [
  { value: "polyphony", content: "Poly" },
  { value: "portamento", content: "Port" },
];

const MidiToCvUi: React.FC<NodeUiProps<MidiToCvNode>> = ({
  node,
  onPatchNode,
  startBatch,
  endBatch,
}) => {
  const { mode } = node.state;

  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
      <RadioGroup<MidiToCvMode>
        value={mode}
        onChange={(v) => onPatchNode(node.id, { mode: v })}
        options={modeOptions}
        label="Mode"
      />
      {mode === "polyphony" ? (
        <NumericInput
          value={node.state.voiceCount}
          onChange={(v) => onPatchNode(node.id, { voiceCount: v })}
          min={1}
          max={32}
          step={1}
          label="Voices"
          format={(v) => Math.round(v).toString()}
          width={48}
        />
      ) : (
        <Knob
          value={node.state.portamentoMs}
          onChange={(v) => onPatchNode(node.id, { portamentoMs: v })}
          min={0}
          max={2000}
          label="Speed"
          unit={ms}
          onDragStart={startBatch}
          onDragEnd={endBatch}
        />
      )}
      <NumericInput
        value={node.state.channel}
        onChange={(v) => onPatchNode(node.id, { channel: v })}
        min={0}
        max={16}
        step={1}
        label="Channel"
        format={(v) => (v === 0 ? "All" : Math.round(v).toString())}
        width={48}
      />
    </div>
  );
};

export const midiToCvGraph: NodeDefinition<MidiToCvNode> = {
  type: "midiToCv",
  title: "MIDI→CV",
  defaultState,
  ports: () => [
    { id: "midi_in", name: "MIDI", kind: "midi", direction: "in" },
    { id: "gate_out", name: "Gate", kind: "gate", direction: "out" },
    { id: "pitch_out", name: "Pitch", kind: "pitch", direction: "out" },
    { id: "velocity_out", name: "Vel", kind: "cv", direction: "out" },
    { id: "pressure_out", name: "Press", kind: "cv", direction: "out" },
    { id: "slide_out", name: "Slide", kind: "pitch", direction: "out" },
    { id: "lift_out", name: "Lift", kind: "cv", direction: "out" },
  ],
  ui: MidiToCvUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<MidiToCvNode["state"]>;
    const d = defaultState();
    return {
      mode: s.mode === "polyphony" || s.mode === "portamento" ? s.mode : d.mode,
      voiceCount: s.voiceCount ?? d.voiceCount,
      portamentoMs: typeof s.portamentoMs === "number" ? s.portamentoMs : d.portamentoMs,
      channel: typeof s.channel === "number" ? s.channel : d.channel,
    };
  },
};
