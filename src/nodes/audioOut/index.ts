import "./types";
import type { GraphNode } from "@graph/types";
import type { NodeModule } from "@/types/nodeModule";
import { audioOutGraph } from "./graph";
import { audioOutAudioFactory } from "./audio";

type AudioOutNode = Extract<GraphNode, { type: "audioOut" }>;

export const audioOutNode: NodeModule<AudioOutNode> = {
  type: "audioOut",
  graph: audioOutGraph,
  audioFactory: audioOutAudioFactory,
};
