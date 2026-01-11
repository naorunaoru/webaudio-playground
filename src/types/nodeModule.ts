import type { AudioGraphContext } from "../audio/context";
import type { GraphNode } from "../graph/types";
import type { AudioNodeFactory } from "./audioRuntime";
import type { NodeDefinition } from "./graphNodeDefinition";

export type AudioNodeServices = Readonly<{
  masterInput: AudioNode;
  graphContext: AudioGraphContext;
}>;

export type NodeModule<TNode extends GraphNode = GraphNode> = Readonly<{
  type: TNode["type"];
  graph: NodeDefinition<TNode>;
  audioFactory?: (services: AudioNodeServices) => AudioNodeFactory<TNode>;
  workletModules?: ReadonlyArray<string>;
}>;
