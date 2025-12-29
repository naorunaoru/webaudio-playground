import type { GraphNode, MidiEvent } from "../../graph/types";
import type { NodeDefinition, NodeUiProps } from "../../types/graphNodeDefinition";

type OscillatorNode = Extract<GraphNode, { type: "oscillator" }>;

function defaultState(): OscillatorNode["state"] {
  return {
    source: "wave",
    waveform: "sawtooth",
    lastMidiNote: null,
    lastMidiAtMs: null,
  };
}

const OscillatorUi: React.FC<NodeUiProps<OscillatorNode>> = ({ node, onPatchNode }) => {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, opacity: 0.75 }}>Source</span>
        <select
          value={node.state.source}
          onChange={(e) =>
            onPatchNode(node.id, { source: e.target.value as OscillatorNode["state"]["source"] })
          }
        >
          <option value="wave">wave</option>
          <option value="noise">noise</option>
        </select>
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, opacity: 0.75 }}>Waveform</span>
        <select
          value={node.state.waveform}
          onChange={(e) => onPatchNode(node.id, { waveform: e.target.value as OscillatorType })}
          disabled={node.state.source !== "wave"}
        >
          <option value="sine">sine</option>
          <option value="triangle">triangle</option>
          <option value="square">square</option>
          <option value="sawtooth">sawtooth</option>
        </select>
      </label>

      <div style={{ fontSize: 12, opacity: 0.8 }}>
        Last MIDI note: {node.state.lastMidiNote ?? "—"}
      </div>
    </div>
  );
};

export const oscillatorGraph: NodeDefinition<OscillatorNode> = {
  type: "oscillator",
  title: "Oscillator",
  defaultState,
  ports: () => [
    { id: "midi_in", name: "MIDI", kind: "midi", direction: "in" },
    { id: "audio_out", name: "Audio", kind: "audio", direction: "out" },
  ],
  ui: OscillatorUi,
  normalizeState: (state) => {
    const s = (state ?? {}) as Partial<OscillatorNode["state"]> & { env?: any };
    const d = defaultState();
    return {
      source: (s.source ?? d.source) as OscillatorNode["state"]["source"],
      waveform: (s.waveform ?? d.waveform) as OscillatorType,
      lastMidiNote: s.lastMidiNote ?? d.lastMidiNote,
      lastMidiAtMs: s.lastMidiAtMs ?? d.lastMidiAtMs,
    };
  },
  onMidi: (node, event, portId) => {
    if (event.type === "noteOn") {
      if (portId && portId !== "midi_in") return null;
      return { lastMidiNote: event.note, lastMidiAtMs: event.atMs };
    }
    return null;
  },
};
