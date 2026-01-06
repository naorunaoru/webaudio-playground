import type { GraphNode } from "../../graph/types";
import type { NodeDefinition, NodeUiProps } from "../../types/graphNodeDefinition";
import { Knob } from "../../ui/components";
import { ThemeProvider } from "../../ui/context";
import type { ControlTheme } from "../../ui/types/theme";

type MidiPitchNode = Extract<GraphNode, { type: "midiPitch" }>;

const pitchTheme: ControlTheme = {
  primary: "#14b8a6", // Teal
  secondary: "#5eead4",
  tertiary: "#0d9488",
};

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function defaultState(): MidiPitchNode["state"] {
  return {
    a4Hz: 440,
    ratio: 1,
    detuneCents: 0,
    glideMs: 0,
  };
}

const MidiPitchUi: React.FC<NodeUiProps<MidiPitchNode>> = ({ node, onPatchNode, startBatch, endBatch }) => {
  return (
    <ThemeProvider theme={pitchTheme}>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <Knob
          value={clamp(node.state.ratio, 0.25, 16)}
          onChange={(v) => onPatchNode(node.id, { ratio: v })}
          min={0.25}
          max={16}
          label="Ratio"
          format={(v) => v.toFixed(2)}
          onDragStart={startBatch}
          onDragEnd={endBatch}
        />
        <Knob
          value={clamp(node.state.detuneCents, -1200, 1200)}
          onChange={(v) => onPatchNode(node.id, { detuneCents: v })}
          min={-1200}
          max={1200}
          label="Detune"
          unit="c"
          format={(v) => Math.round(v).toString()}
          onDragStart={startBatch}
          onDragEnd={endBatch}
        />
        <Knob
          value={clamp(node.state.glideMs, 0, 5000)}
          onChange={(v) => onPatchNode(node.id, { glideMs: v })}
          min={0}
          max={5000}
          label="Glide"
          unit="ms"
          format={(v) => Math.round(v).toString()}
          onDragStart={startBatch}
          onDragEnd={endBatch}
        />
      </div>
    </ThemeProvider>
  );
};

export const midiPitchGraph: NodeDefinition<MidiPitchNode> = {
  type: "midiPitch",
  title: "MIDI Pitch",
  defaultState,
  ports: () => [
    { id: "midi_in", name: "MIDI", kind: "midi", direction: "in" },
    { id: "hz_out", name: "Hz", kind: "automation", direction: "out" },
    { id: "vel_out", name: "Vel", kind: "automation", direction: "out" },
    { id: "gate_out", name: "Gate", kind: "automation", direction: "out" },
  ],
  ui: MidiPitchUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<MidiPitchNode["state"]>;
    const d = defaultState();
    return {
      a4Hz: clamp(s.a4Hz ?? d.a4Hz, 200, 1000),
      ratio: clamp(s.ratio ?? d.ratio, 0.25, 16),
      detuneCents: clamp(s.detuneCents ?? d.detuneCents, -1200, 1200),
      glideMs: clamp(s.glideMs ?? d.glideMs, 0, 5000),
    };
  },
};

