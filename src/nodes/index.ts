import type { GraphNode } from "../graph/types";
import type { NodeModule } from "../types/nodeModule";
import { midiSourceNode } from "./midiSource";
import { ccSourceNode } from "./ccSource";
import { oscillatorNode } from "./oscillator";
import { delayNode } from "./delay";
import { limiterNode } from "./limiter";
import { audioOutNode } from "./audioOut";

export const NODE_MODULES = {
  midiSource: midiSourceNode,
  ccSource: ccSourceNode,
  oscillator: oscillatorNode,
  delay: delayNode,
  limiter: limiterNode,
  audioOut: audioOutNode,
} as const satisfies Record<GraphNode["type"], NodeModule<any>>;

export type NodeModuleMap = typeof NODE_MODULES;
