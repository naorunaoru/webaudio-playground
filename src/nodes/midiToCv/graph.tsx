import type { GraphNode } from "@graph/types";
import type { NodeDefinition, NodeUiProps } from "@/types/graphNodeDefinition";
import { NumericInput } from "@ui/components/NumericInput";

type MidiToCvNode = Extract<GraphNode, { type: "midiToCv" }>;

function defaultState(): MidiToCvNode["state"] {
  return { voiceCount: 8, channel: 0 };
}

const MidiToCvUi: React.FC<NodeUiProps<MidiToCvNode>> = ({
  node,
  onPatchNode,
}) => {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
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
      voiceCount: s.voiceCount ?? d.voiceCount,
      channel: typeof s.channel === "number" ? s.channel : d.channel,
    };
  },
};
