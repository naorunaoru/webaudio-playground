import "./types";
import type { GraphNode } from "../../graph/types";
import type { NodeModule } from "../../types/nodeModule";
import { oscillatorGraph } from "./graph";
import { oscillatorAudioFactory } from "./audio";

type OscillatorNode = Extract<GraphNode, { type: "oscillator" }>;

export const oscillatorNode: NodeModule<OscillatorNode> = {
  type: "oscillator",
  graph: oscillatorGraph,
  audioFactory: oscillatorAudioFactory,
};
