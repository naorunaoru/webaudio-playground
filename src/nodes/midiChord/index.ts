import "./types";
import type { GraphNode } from "@graph/types";
import type { NodeModule } from "@/types/nodeModule";
import { midiChordGraph } from "./graph";
import { midiChordAudioFactory } from "./audio";

type MidiChordNode = Extract<GraphNode, { type: "midiChord" }>;

export const midiChordNode: NodeModule<MidiChordNode> = {
  type: "midiChord",
  graph: midiChordGraph,
  audioFactory: midiChordAudioFactory,
};
