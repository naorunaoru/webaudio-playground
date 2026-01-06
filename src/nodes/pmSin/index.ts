import "./types";
import type { GraphNode } from "../../graph/types";
import type { NodeModule } from "../../types/nodeModule";
import { pmSinGraph } from "./graph";
import { pmSinAudioFactory } from "./audio";
import pmSinWorkletUrl from "./processor.ts?worklet";

type PmSinNode = Extract<GraphNode, { type: "pmSin" }>;

export const pmSinNode: NodeModule<PmSinNode> = {
  type: "pmSin",
  graph: pmSinGraph,
  audioFactory: pmSinAudioFactory,
  workletModules: [pmSinWorkletUrl],
};

