import type { GraphNode } from "@graph/types";
import type { NodeDefinition, NodeUiProps } from "@/types/graphNodeDefinition";
import { NumericInput } from "@ui/components";
import type { ChordType } from "./types";

type MidiChordNode = Extract<GraphNode, { type: "midiChord" }>;

const CHORD_OPTIONS: { value: ChordType; label: string }[] = [
  { value: "major", label: "Major" },
  { value: "minor", label: "Minor" },
  { value: "diminished", label: "Dim" },
  { value: "augmented", label: "Aug" },
  { value: "sus2", label: "Sus2" },
  { value: "sus4", label: "Sus4" },
  { value: "major7", label: "Maj7" },
  { value: "minor7", label: "Min7" },
  { value: "dominant7", label: "Dom7" },
];

function defaultState(): MidiChordNode["state"] {
  return { chordType: "major", staggerMs: 0 };
}

const MidiChordUi: React.FC<NodeUiProps<MidiChordNode>> = ({
  node,
  onPatchNode,
  startBatch,
  endBatch,
}) => {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, opacity: 0.75 }}>Chord</span>
        <select
          value={node.state.chordType}
          onChange={(e) =>
            onPatchNode(node.id, { chordType: e.target.value as ChordType })
          }
          style={{
            padding: "4px 8px",
            borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(0,0,0,0.3)",
            color: "inherit",
            fontSize: 13,
          }}
        >
          {CHORD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <NumericInput
        value={node.state.staggerMs}
        onChange={(v) => onPatchNode(node.id, { staggerMs: v })}
        min={-100}
        max={100}
        step={1}
        label="Strum"
        format={(v) => `${v > 0 ? "+" : ""}${Math.round(v)} ms`}
        width={56}
        onDragStart={startBatch}
        onDragEnd={endBatch}
      />
    </div>
  );
};

export const midiChordGraph: NodeDefinition<MidiChordNode> = {
  type: "midiChord",
  title: "MIDI Chord",
  defaultState,
  ports: () => [
    { id: "midi_in", name: "MIDI", kind: "midi", direction: "in" },
    { id: "midi_out", name: "MIDI", kind: "midi", direction: "out" },
  ],
  ui: MidiChordUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<MidiChordNode["state"]>;
    const d = defaultState();
    return {
      chordType: s.chordType ?? d.chordType,
      staggerMs: s.staggerMs ?? d.staggerMs,
    };
  },
};
