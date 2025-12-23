import "./types";
import type { GraphNode } from "../../graph/types";
import type { NodeModule } from "../../types/nodeModule";
import { ccSourceGraph } from "./graph";

type CcSourceNode = Extract<GraphNode, { type: "ccSource" }>;

export const ccSourceNode: NodeModule<CcSourceNode> = {
  type: "ccSource",
  graph: ccSourceGraph,
};
