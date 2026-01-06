import "./types";
import type { GraphNode } from "../../graph/types";
import type { NodeModule } from "../../types/nodeModule";
import { pmOscillatorGraph } from "./graph";
import { pmOscillatorAudioFactory } from "./audio";
import pmOscillatorWorkletUrl from "./processor.ts?worklet";

type PmOscillatorNode = Extract<GraphNode, { type: "pmOscillator" }>;

export const pmOscillatorNode: NodeModule<PmOscillatorNode> = {
  type: "pmOscillator",
  graph: pmOscillatorGraph,
  audioFactory: pmOscillatorAudioFactory,
  workletModules: [pmOscillatorWorkletUrl],
};

