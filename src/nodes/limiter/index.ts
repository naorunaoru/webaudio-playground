import "./types";
import type { GraphNode } from "../../graph/types";
import type { NodeModule } from "../../types/nodeModule";
import { limiterGraph } from "./graph";
import { limiterAudioFactory } from "./audio";
import limiterWorkletUrl from "./processor.ts?url";

type LimiterNode = Extract<GraphNode, { type: "limiter" }>;

export const limiterNode: NodeModule<LimiterNode> = {
  type: "limiter",
  graph: limiterGraph,
  audioFactory: limiterAudioFactory,
  workletModules: [limiterWorkletUrl],
};
