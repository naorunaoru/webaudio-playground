import "./types";
import type { GraphNode } from "@graph/types";
import type { NodeModule } from "@/types/nodeModule";
import { envelopeGraph } from "./graph";
import { envelopeAudioFactory } from "./audio";

type EnvelopeNode = Extract<GraphNode, { type: "envelope" }>;

export const envelopeNode: NodeModule<EnvelopeNode> = {
  type: "envelope",
  graph: envelopeGraph,
  audioFactory: envelopeAudioFactory,
};
