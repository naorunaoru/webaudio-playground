import "./types";
import type { GraphNode } from "../../graph/types";
import type { NodeModule } from "../../types/nodeModule";
import { midiPitchGraph } from "./graph";
import { midiPitchAudioFactory } from "./audio";

type MidiPitchNode = Extract<GraphNode, { type: "midiPitch" }>;

export const midiPitchNode: NodeModule<MidiPitchNode> = {
  type: "midiPitch",
  graph: midiPitchGraph,
  audioFactory: midiPitchAudioFactory,
};

