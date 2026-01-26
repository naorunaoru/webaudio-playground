import "./types";
import type { GraphNode } from "@graph/types";
import type { NodeModule } from "@/types/nodeModule";
import { pitchTransposeGraph } from "./graph";
import { pitchTransposeAudioFactory } from "./audio";

type PitchTransposeNodeGraph = Extract<GraphNode, { type: "pitchTranspose" }>;

export const pitchTransposeNode: NodeModule<PitchTransposeNodeGraph> = {
  type: "pitchTranspose",
  graph: pitchTransposeGraph,
  audioFactory: pitchTransposeAudioFactory,
};
