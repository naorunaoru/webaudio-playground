import "./types";
import type { GraphNode } from "@graph/types";
import type { NodeModule } from "@/types/nodeModule";
import { vcoGraph } from "./graph";
import { vcoAudioFactory } from "./audio";
import vcoProcessorUrl from "./processor.ts?worklet";

type VcoNode = Extract<GraphNode, { type: "vco" }>;

export const vcoNode: NodeModule<VcoNode> = {
  type: "vco",
  graph: vcoGraph,
  audioFactory: vcoAudioFactory,
  workletModules: [vcoProcessorUrl],
};
