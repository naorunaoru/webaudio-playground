import "./types";
import type { GraphNode } from "@graph/types";
import type { NodeModule } from "@/types/nodeModule";
import { midiToCvGraph } from "./graph";
import { midiToCvAudioFactory } from "./audio";

type MidiToCvNode = Extract<GraphNode, { type: "midiToCv" }>;

export const midiToCvNode: NodeModule<MidiToCvNode> = {
  type: "midiToCv",
  graph: midiToCvGraph,
  audioFactory: midiToCvAudioFactory,
};
