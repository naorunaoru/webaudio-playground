import "./types";
import type { GraphNode } from "@graph/types";
import type { NodeModule } from "@/types/nodeModule";
import { delayGraph } from "./graph";
import { delayAudioFactory } from "./audio";

type DelayNode = Extract<GraphNode, { type: "delay" }>;

export const delayNode: NodeModule<DelayNode> = {
  type: "delay",
  graph: delayGraph,
  audioFactory: delayAudioFactory,
};
