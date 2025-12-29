import "./types";
import type { GraphNode } from "../../graph/types";
import type { NodeModule } from "../../types/nodeModule";
import { filterGraph } from "./graph";
import { filterAudioFactory } from "./audio";

type FilterNode = Extract<GraphNode, { type: "filter" }>;

export const filterNode: NodeModule<FilterNode> = {
  type: "filter",
  graph: filterGraph,
  audioFactory: filterAudioFactory,
};

