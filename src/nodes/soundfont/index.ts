import "./types";
import type { GraphNode } from "@graph/types";
import type { NodeModule } from "@/types/nodeModule";
import { soundfontGraph } from "./graph";
import { soundfontAudioFactory } from "./audio";

type SoundfontNode = Extract<GraphNode, { type: "soundfont" }>;

export const soundfontNode: NodeModule<SoundfontNode> = {
  type: "soundfont",
  graph: soundfontGraph,
  audioFactory: soundfontAudioFactory,
};
