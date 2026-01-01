import type { GraphState } from "./types";
import { createNode } from "./graphUtils";

export function initialGraph(): GraphState {
  return {
    nodes: [
      createNode("midiSource", 40, 120, "n_midi"),
      createNode("ccSource", 40, 300, "n_cc"),
      createNode("oscillator", 340, 90, "n_osc"),
      createNode("envelope", 340, 290, "n_env"),
      createNode("filter", 520, 150, "n_filter"),
      createNode("gain", 700, 150, "n_gain"),
      createNode("audioOut", 880, 150, "n_out"),
    ],
    connections: [
      {
        id: "c_midi_osc",
        kind: "midi",
        from: { nodeId: "n_midi", portId: "midi_out" },
        to: { nodeId: "n_osc", portId: "midi_in" },
      },
      {
        id: "c_midi_env",
        kind: "midi",
        from: { nodeId: "n_midi", portId: "midi_out" },
        to: { nodeId: "n_env", portId: "midi_in" },
      },
      {
        id: "c_osc_gain",
        kind: "audio",
        from: { nodeId: "n_osc", portId: "audio_out" },
        to: { nodeId: "n_filter", portId: "audio_in" },
      },
      {
        id: "c_filter_gain",
        kind: "audio",
        from: { nodeId: "n_filter", portId: "audio_out" },
        to: { nodeId: "n_gain", portId: "audio_in" },
      },
      {
        id: "c_env_gain",
        kind: "automation",
        from: { nodeId: "n_env", portId: "env_out" },
        to: { nodeId: "n_gain", portId: "gain_in" },
      },
      {
        id: "c_env_filter",
        kind: "automation",
        from: { nodeId: "n_env", portId: "env_out" },
        to: { nodeId: "n_filter", portId: "freq_in" },
      },
      {
        id: "c_gain_out",
        kind: "audio",
        from: { nodeId: "n_gain", portId: "audio_out" },
        to: { nodeId: "n_out", portId: "audio_in" },
      },
    ],
  };
}
