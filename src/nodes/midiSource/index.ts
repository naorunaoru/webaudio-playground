import "./types";
import type { GraphNode } from "../../graph/types";
import type { NodeModule } from "../../types/nodeModule";
import { midiSourceGraph } from "./graph";

type MidiSourceNode = Extract<GraphNode, { type: "midiSource" }>;

export const midiSourceNode: NodeModule<MidiSourceNode> = {
  type: "midiSource",
  graph: midiSourceGraph,
};
