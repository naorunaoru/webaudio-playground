import type { GraphNode } from "@graph/types";
import type { NodeModule } from "@/types/nodeModule";
import { midiSourceNode } from "./midiSource";
import { ccSourceNode } from "./ccSource";
import { midiPitchNode } from "./midiPitch";
import { oscillatorNode } from "./oscillator";
import { pmOscillatorNode } from "./pmOscillator";
import { pmPhasorNode } from "./pmPhasor";
import { pmSinNode } from "./pmSin";
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
  midiPitch: midiPitchNode,
  oscillator: oscillatorNode,
  pmOscillator: pmOscillatorNode,
  pmPhasor: pmPhasorNode,
  pmSin: pmSinNode,
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
