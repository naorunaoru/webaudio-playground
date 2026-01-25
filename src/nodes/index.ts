import type { GraphNode } from "@graph/types";
import type { NodeModule } from "@/types/nodeModule";
import { channelNode } from "./channel";
import { midiSourceNode } from "./midiSource";
import { ccSourceNode } from "./ccSource";
import { midiToCvNode } from "./midiToCv";
import { midiChordNode } from "./midiChord";
import { midiMonitorNode } from "./midiMonitor";
import { voiceMonitorNode } from "./voiceMonitor";
import { oscillatorNode } from "./oscillator";
import { vcoNode } from "./vco";
import { vcaNode } from "./vca";
import { lfoNode } from "./lfo";
import { envelopeNode } from "./envelope";
import { gainNode } from "./gain";
import { filterNode } from "./filter";
import { delayNode } from "./delay";
import { reverbNode } from "./reverb";
import { limiterNode } from "./limiter";
import { samplePlayerNode } from "./samplePlayer";
import { audioOutNode } from "./audioOut";

export const NODE_MODULES = {
  channel: channelNode,
  midiSource: midiSourceNode,
  ccSource: ccSourceNode,
  midiToCv: midiToCvNode,
  midiChord: midiChordNode,
  midiMonitor: midiMonitorNode,
  voiceMonitor: voiceMonitorNode,
  oscillator: oscillatorNode,
  vco: vcoNode,
  vca: vcaNode,
  lfo: lfoNode,
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
