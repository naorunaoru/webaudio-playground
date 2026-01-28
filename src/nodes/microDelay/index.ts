import "./types";
import type { GraphNode } from "@graph/types";
import type { NodeModule } from "@/types/nodeModule";
import { microDelayGraph } from "./graph";
import { microDelayAudioFactory } from "./audio";
import microDelayProcessorUrl from "./processor.ts?worklet";

type MicroDelayNode = Extract<GraphNode, { type: "microDelay" }>;

export const microDelayNode: NodeModule<MicroDelayNode> = {
  type: "microDelay",
  graph: microDelayGraph,
  audioFactory: microDelayAudioFactory,
  workletModules: [microDelayProcessorUrl],
};
