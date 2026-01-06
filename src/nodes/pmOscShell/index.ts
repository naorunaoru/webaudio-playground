import "./types";
import type { GraphNode } from "../../graph/types";
import type { NodeModule } from "../../types/nodeModule";
import { pmOscShellGraph } from "./graph";

type PmOscShellNode = Extract<GraphNode, { type: "pmOscShell" }>;

export const pmOscShellNode: NodeModule<PmOscShellNode> = {
  type: "pmOscShell",
  graph: pmOscShellGraph,
};

