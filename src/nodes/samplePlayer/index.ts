import "./types";
import type { GraphNode } from "@graph/types";
import type { NodeModule } from "@/types/nodeModule";
import { samplePlayerGraph } from "./graph";
import { samplePlayerAudioFactory } from "./audio";

type SamplePlayerNode = Extract<GraphNode, { type: "samplePlayer" }>;

export const samplePlayerNode: NodeModule<SamplePlayerNode> = {
  type: "samplePlayer",
  graph: samplePlayerGraph,
  audioFactory: samplePlayerAudioFactory,
};

