import "./types";
import type { GraphNode } from "../../graph/types";
import type { NodeModule } from "../../types/nodeModule";
import { gainGraph } from "./graph";
import { gainAudioFactory } from "./audio";

type GainNodeGraph = Extract<GraphNode, { type: "gain" }>;

export const gainNode: NodeModule<GainNodeGraph> = {
  type: "gain",
  graph: gainGraph,
  audioFactory: gainAudioFactory,
};

