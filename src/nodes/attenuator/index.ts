import "./types";
import type { GraphNode } from "@graph/types";
import type { NodeModule } from "@/types/nodeModule";
import { attenuatorGraph } from "./graph";
import { attenuatorAudioFactory } from "./audio";

type AttenuatorNodeGraph = Extract<GraphNode, { type: "attenuator" }>;

export const attenuatorNode: NodeModule<AttenuatorNodeGraph> = {
  type: "attenuator",
  graph: attenuatorGraph,
  audioFactory: attenuatorAudioFactory,
};
