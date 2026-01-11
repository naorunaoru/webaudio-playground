import "./types";
import type { GraphNode } from "@graph/types";
import type { NodeModule } from "@/types/nodeModule";
import { pmPhasorGraph } from "./graph";
import { pmPhasorAudioFactory } from "./audio";
import pmPhasorWorkletUrl from "./processor.ts?worklet";

type PmPhasorNode = Extract<GraphNode, { type: "pmPhasor" }>;

export const pmPhasorNode: NodeModule<PmPhasorNode> = {
  type: "pmPhasor",
  graph: pmPhasorGraph,
  audioFactory: pmPhasorAudioFactory,
  workletModules: [pmPhasorWorkletUrl],
};

