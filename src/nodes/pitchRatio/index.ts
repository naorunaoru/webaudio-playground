import "./types";
import type { GraphNode } from "@graph/types";
import type { NodeModule } from "@/types/nodeModule";
import { pitchRatioGraph } from "./graph";
import { pitchRatioAudioFactory } from "./audio";

type PitchRatioNodeGraph = Extract<GraphNode, { type: "pitchRatio" }>;

export const pitchRatioNode: NodeModule<PitchRatioNodeGraph> = {
  type: "pitchRatio",
  graph: pitchRatioGraph,
  audioFactory: pitchRatioAudioFactory,
};
