import "./types";
import type { GraphNode } from "@graph/types";
import type { NodeModule } from "@/types/nodeModule";
import { voiceMonitorGraph } from "./graph";
import { voiceMonitorAudioFactory } from "./audio";

type VoiceMonitorNode = Extract<GraphNode, { type: "voiceMonitor" }>;

export const voiceMonitorNode: NodeModule<VoiceMonitorNode> = {
  type: "voiceMonitor",
  graph: voiceMonitorGraph,
  audioFactory: voiceMonitorAudioFactory,
};
