import "./types";
import type { GraphNode } from "@graph/types";
import type { NodeModule } from "@/types/nodeModule";
import { midiMonitorGraph } from "./graph";
import { midiMonitorAudioFactory } from "./audio";

type MidiMonitorNode = Extract<GraphNode, { type: "midiMonitor" }>;

export const midiMonitorNode: NodeModule<MidiMonitorNode> = {
  type: "midiMonitor",
  graph: midiMonitorGraph,
  audioFactory: midiMonitorAudioFactory,
};
