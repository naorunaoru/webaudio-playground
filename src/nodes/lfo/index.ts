import "./types";
import type { GraphNode } from "@graph/types";
import type { NodeModule } from "@/types/nodeModule";
import { lfoGraph } from "./graph";
import { lfoAudioFactory } from "./audio";

type LfoNode = Extract<GraphNode, { type: "lfo" }>;

export const lfoNode: NodeModule<LfoNode> = {
  type: "lfo",
  graph: lfoGraph,
  audioFactory: lfoAudioFactory,
};
