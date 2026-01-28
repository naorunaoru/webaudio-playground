import type { GraphNode } from "@graph/types";
import type { NodeModule } from "@/types/nodeModule";
import { channelNode } from "./channel";
import { midiSourceNode } from "./midiSource";
import { midiToCvNode } from "./midiToCv";
import { midiChordNode } from "./midiChord";
import { midiPlayerNode } from "./midiPlayer";
import { midiMonitorNode } from "./midiMonitor";
import { voiceMonitorNode } from "./voiceMonitor";
import { oscillatorNode } from "./oscillator";
import { vcoNode } from "./vco";
import { vcaNode } from "./vca";
import { lfoNode } from "./lfo";
import { envelopeNode } from "./envelope";
import { gainNode } from "./gain";
import { filterNode } from "./filter";
import { pitchTransposeNode } from "./pitchTranspose";
import { pitchRatioNode } from "./pitchRatio";
import { attenuatorNode } from "./attenuator";
import { delayNode } from "./delay";
import { microDelayNode } from "./microDelay";
import { reverbNode } from "./reverb";
import { limiterNode } from "./limiter";
import { samplePlayerNode } from "./samplePlayer";
import { soundfontNode } from "./soundfont";
import { audioOutNode } from "./audioOut";

export const NODE_MODULES = {
  channel: channelNode,
  midiSource: midiSourceNode,
  midiToCv: midiToCvNode,
  midiChord: midiChordNode,
  midiPlayer: midiPlayerNode,
  midiMonitor: midiMonitorNode,
  voiceMonitor: voiceMonitorNode,
  oscillator: oscillatorNode, // superseded by VCO
  vco: vcoNode,
  vca: vcaNode,
  lfo: lfoNode,
  envelope: envelopeNode,
  gain: gainNode, // superseded by VCA
  filter: filterNode,
  pitchTranspose: pitchTransposeNode,
  pitchRatio: pitchRatioNode,
  attenuator: attenuatorNode,
  delay: delayNode,
  microDelay: microDelayNode,
  reverb: reverbNode,
  limiter: limiterNode,
  samplePlayer: samplePlayerNode,
  soundfont: soundfontNode,
  audioOut: audioOutNode,
} as const satisfies Record<GraphNode["type"], NodeModule<any>>;

export type NodeModuleMap = typeof NODE_MODULES;
