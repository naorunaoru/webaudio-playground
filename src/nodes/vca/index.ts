import "./types";
import type { GraphNode } from "@graph/types";
import type { NodeModule } from "@/types/nodeModule";
import { vcaGraph } from "./graph";
import { vcaAudioFactory } from "./audio";

type VcaNode = Extract<GraphNode, { type: "vca" }>;

export const vcaNode: NodeModule<VcaNode> = {
  type: "vca",
  graph: vcaGraph,
  audioFactory: vcaAudioFactory,
};
