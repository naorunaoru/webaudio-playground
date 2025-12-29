import type { GraphNode } from "../graph/types";
import type { NodeModule } from "../types/nodeModule";
import { midiSourceNode } from "./midiSource";
import { ccSourceNode } from "./ccSource";
import { oscillatorNode } from "./oscillator";
import { envelopeNode } from "./envelope";
import { gainNode } from "./gain";
import { filterNode } from "./filter";
import { delayNode } from "./delay";
import { reverbNode } from "./reverb";
import { limiterNode } from "./limiter";
import { samplePlayerNode } from "./samplePlayer";
import { audioOutNode } from "./audioOut";

export const NODE_MODULES = {
  midiSource: midiSourceNode,
  ccSource: ccSourceNode,
  oscillator: oscillatorNode,
  envelope: envelopeNode,
  gain: gainNode,
  filter: filterNode,
  delay: delayNode,
  reverb: reverbNode,
  limiter: limiterNode,
  samplePlayer: samplePlayerNode,
  audioOut: audioOutNode,
} as const satisfies Record<GraphNode["type"], NodeModule<any>>;

export type NodeModuleMap = typeof NODE_MODULES;
