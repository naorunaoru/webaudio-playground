import "./types";
import type { GraphNode } from "@graph/types";
import type { NodeModule } from "@/types/nodeModule";
import { channelGraph } from "./graph";
import { channelAudioFactory } from "./audio";

type ChannelNode = Extract<GraphNode, { type: "channel" }>;

export const channelNode: NodeModule<ChannelNode> = {
  type: "channel",
  graph: channelGraph,
  audioFactory: channelAudioFactory,
};
