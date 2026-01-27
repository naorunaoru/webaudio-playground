import "./types";
import type { GraphNode } from "@graph/types";
import type { NodeModule } from "@/types/nodeModule";
import { midiPlayerGraph } from "./graph";
import { midiPlayerAudioFactory } from "./audio";

type MidiPlayerNode = Extract<GraphNode, { type: "midiPlayer" }>;

export const midiPlayerNode: NodeModule<MidiPlayerNode> = {
  type: "midiPlayer",
  graph: midiPlayerGraph,
  audioFactory: midiPlayerAudioFactory,
};
