import "./types";
import type { GraphNode } from "../../graph/types";
import type { NodeModule } from "../../types/nodeModule";
import { reverbGraph } from "./graph";
import { reverbAudioFactory } from "./audio";

type ReverbNode = Extract<GraphNode, { type: "reverb" }>;

export const reverbNode: NodeModule<ReverbNode> = {
  type: "reverb",
  graph: reverbGraph,
  audioFactory: reverbAudioFactory,
};

