import type { GraphNode } from "../graph/types";
import { NODE_MODULES } from "../nodes";
import type { AudioNodeFactory } from "../types/audioRuntime";

export type AudioNodeFactoryMap = Partial<Record<GraphNode["type"], AudioNodeFactory<any>>>;

export function createBuiltInAudioNodeFactories(masterInput: AudioNode): AudioNodeFactoryMap {
  const out: AudioNodeFactoryMap = {};
  for (const type of Object.keys(NODE_MODULES) as Array<GraphNode["type"]>) {
    const mod = NODE_MODULES[type];
    if (!mod.audioFactory) continue;
    out[type] = mod.audioFactory({ masterInput });
  }
  return out;
}

export function listBuiltInAudioWorkletModules(): ReadonlyArray<string> {
  const urls = new Set<string>();
  for (const type of Object.keys(NODE_MODULES) as Array<GraphNode["type"]>) {
    const mod = NODE_MODULES[type];
    for (const url of mod.workletModules ?? []) urls.add(url);
  }
  return [...urls];
}
