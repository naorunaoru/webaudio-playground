import type { GraphState } from "./types";
import { createNode } from "./graphUtils";

export function initialGraph(): GraphState {
  return {
    nodes: [
      createNode("midiSource", 40, 150, "n_midi"),
      createNode("midiToCv", 220, 150, "n_m2cv"),
      createNode("lfo", 220, 350, "n_lfo", {
        rangeMin: -0.04,
        rangeMax: 0.04,
        frequencyHz: 5,
      }),
      createNode("vco", 470, 100, "n_vco", { waveform: "sawtooth" }),
      createNode("envelope", 470, 320, "n_env", {
        env: {
          attackMs: 2,
          decayMs: 250,
          sustain: 0.3,
          releaseMs: 350,
          attackShape: 0.6,
          decayShape: 0.6,
          releaseShape: 0.6,
          retrigger: true,
        },
      }),
      createNode("vca", 670, 150, "n_vca_env"),
      createNode("vca", 820, 150, "n_vca_vel"),
      createNode("audioOut", 970, 150, "n_out"),
    ],
    connections: [
      {
        id: "c_midi_m2cv",
        kind: "midi",
        from: { nodeId: "n_midi", portId: "midi_out" },
        to: { nodeId: "n_m2cv", portId: "midi_in" },
      },
      {
        id: "c_m2cv_vco",
        kind: "pitch",
        from: { nodeId: "n_m2cv", portId: "pitch_out" },
        to: { nodeId: "n_vco", portId: "pitch_in" },
      },
      {
        id: "c_lfo_vco",
        kind: "cv",
        from: { nodeId: "n_lfo", portId: "lfo_out" },
        to: { nodeId: "n_vco", portId: "pitch_in" },
      },
      {
        id: "c_m2cv_env",
        kind: "gate",
        from: { nodeId: "n_m2cv", portId: "gate_out" },
        to: { nodeId: "n_env", portId: "gate_in" },
      },
      {
        id: "c_vco_vca",
        kind: "audio",
        from: { nodeId: "n_vco", portId: "audio_out" },
        to: { nodeId: "n_vca_env", portId: "audio_in" },
      },
      {
        id: "c_env_vca",
        kind: "cv",
        from: { nodeId: "n_env", portId: "env_out" },
        to: { nodeId: "n_vca_env", portId: "cv_in" },
      },
      {
        id: "c_vca_env_vel",
        kind: "audio",
        from: { nodeId: "n_vca_env", portId: "audio_out" },
        to: { nodeId: "n_vca_vel", portId: "audio_in" },
      },
      {
        id: "c_vel_vca",
        kind: "cv",
        from: { nodeId: "n_m2cv", portId: "velocity_out" },
        to: { nodeId: "n_vca_vel", portId: "cv_in" },
      },
      {
        id: "c_vca_out",
        kind: "audio",
        from: { nodeId: "n_vca_vel", portId: "audio_out" },
        to: { nodeId: "n_out", portId: "audio_in" },
      },
    ],
  };
}
