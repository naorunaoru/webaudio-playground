import type { GraphNode, GraphState, MidiEvent, NodeId } from "../graph/types";
import { createBuiltInAudioNodeFactories, listBuiltInAudioWorkletModules } from "./nodeRegistry";
import type { AudioNodeFactoryMap } from "./nodeRegistry";
import type { AudioNodeFactory, AudioNodeInstance } from "../types/audioRuntime";

export type EngineStatus = {
  state: AudioContextState;
  sampleRate: number;
};

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterMeter: AnalyserNode | null = null;
  private masterMeterBuffer: Float32Array<ArrayBufferLike> | null = null;
  private audioNodes = new Map<NodeId, AudioNodeInstance<any>>();
  private outputNodeIds = new Set<NodeId>();
  private factories: AudioNodeFactoryMap | null = null;
  private factoryOverrides: AudioNodeFactoryMap = {};
  private loadedWorkletModules = new Set<string>();

  getStatus(): EngineStatus | null {
    if (!this.audioContext) return null;
    return { state: this.audioContext.state, sampleRate: this.audioContext.sampleRate };
  }

  getLevels(): Record<NodeId, number> {
    const out: Record<NodeId, number> = {};

    for (const [id, n] of this.audioNodes) {
      if (n.getLevel) out[id] = n.getLevel();
    }

    const master =
      this.masterMeter && this.masterMeterBuffer
        ? rmsFromAnalyser(this.masterMeter, this.masterMeterBuffer)
        : 0;
    for (const outId of this.outputNodeIds) out[outId] = master;

    return out;
  }

  getDebug(): Record<NodeId, unknown> {
    const out: Record<NodeId, unknown> = {};
    for (const [id, n] of this.audioNodes) {
      if (n.getDebug) out[id] = n.getDebug();
    }
    return out;
  }

  getOutputWaveform(length = 256): Float32Array | null {
    const analyser = this.masterMeter;
    const buffer = this.masterMeterBuffer;
    if (!analyser || !buffer) return null;

    analyser.getFloatTimeDomainData(buffer as any);
    if (length <= 0) return new Float32Array();
    if (length === buffer.length) return new Float32Array(buffer);

    const out = new Float32Array(length);
    const stride = (buffer.length - 1) / Math.max(1, length - 1);
    for (let i = 0; i < length; i++) {
      const idx = i * stride;
      const i0 = Math.floor(idx);
      const i1 = Math.min(buffer.length - 1, i0 + 1);
      const t = idx - i0;
      const a = buffer[i0] ?? 0;
      const b = buffer[i1] ?? 0;
      out[i] = a + (b - a) * t;
    }
    return out;
  }

  ensureContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 1;
      this.masterMeter = this.audioContext.createAnalyser();
      this.masterMeter.fftSize = 256;
      this.masterMeter.smoothingTimeConstant = 0.5;
      this.masterMeterBuffer = new Float32Array(this.masterMeter.fftSize) as Float32Array<ArrayBufferLike>;
      this.masterGain.connect(this.masterMeter);
      this.masterMeter.connect(this.audioContext.destination);
      this.factories = {
        ...createBuiltInAudioNodeFactories(this.masterGain),
        ...this.factoryOverrides,
      };
    }
    return this.audioContext;
  }

  async ensureRunning(): Promise<void> {
    const ctx = this.ensureContext();
    await this.ensureBuiltInWorkletsLoaded(ctx);
    if (ctx.state !== "running") await ctx.resume();
  }

  async toggleRunning(): Promise<AudioContextState> {
    const ctx = this.ensureContext();
    if (ctx.state === "running") {
      await ctx.suspend();
    } else {
      await this.ensureBuiltInWorkletsLoaded(ctx);
      await ctx.resume();
    }
    return ctx.state;
  }

  registerAudioNodeFactory<TType extends GraphNode["type"]>(
    type: TType,
    factory: AudioNodeFactory<any>,
  ) {
    this.factoryOverrides[type] = factory;
    if (this.factories) this.factories[type] = factory;
  }

  syncGraph(graph: GraphState): void {
    const ctx = this.audioContext;
    if (!ctx) return;
    const factories = this.factories;
    if (!factories) return;

    const alive = new Set<NodeId>(graph.nodes.map((n) => n.id));
    for (const [nodeId] of this.audioNodes) {
      if (!alive.has(nodeId)) {
        this.teardownNode(nodeId);
      }
    }

    this.outputNodeIds = new Set(graph.nodes.filter((n) => n.type === "audioOut").map((n) => n.id));

    for (const node of graph.nodes) {
      const factory = factories[node.type];
      if (!factory) continue;
      const existing = this.audioNodes.get(node.id);
      if (!existing || existing.type !== node.type) {
        existing?.onRemove?.();
        this.audioNodes.set(node.id, factory.create(ctx, node.id));
      }
      this.audioNodes.get(node.id)?.updateState(node.state as any);
    }

    const disconnected = new Set<string>();
    for (const conn of graph.connections) {
      if (conn.kind !== "audio" && conn.kind !== "automation") continue;
      const from = this.audioNodes.get(conn.from.nodeId);
      if (!from?.getAudioOutput) continue;
      const key = `${conn.from.nodeId}:${conn.from.portId}`;
      if (disconnected.has(key)) continue;
      disconnected.add(key);
      from.getAudioOutput(conn.from.portId)?.disconnect();
    }

    for (const conn of graph.connections) {
      if (conn.kind !== "audio" && conn.kind !== "automation") continue;
      const from = this.audioNodes.get(conn.from.nodeId);
      const to = this.audioNodes.get(conn.to.nodeId);
      if (!from || !to) continue;
      const out = from.getAudioOutput?.(conn.from.portId);
      const input = to.getAudioInput?.(conn.to.portId);
      if (out && input) out.connect(input as any);
    }
  }

  dispatchMidi(graph: GraphState, sourceNodeId: NodeId, event: MidiEvent): void {
    const ctx = this.audioContext;
    if (!ctx) return;

    const seen = new Set<string>();
    const queue: Array<{ nodeId: NodeId; portId: string | null }> = [];

    const edgeKind = event.type === "cc" ? "cc" : "midi";
    const starts = graph.connections.filter(
      (c) => c.kind === edgeKind && c.from.nodeId === sourceNodeId,
    );
    for (const conn of starts) queue.push({ nodeId: conn.to.nodeId, portId: conn.to.portId });

    while (queue.length > 0) {
      const current = queue.shift()!;
      const key = `${current.nodeId}:${current.portId ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const node = graph.nodes.find((n) => n.id === current.nodeId);
      if (node) {
        const runtime = this.audioNodes.get(node.id);
        runtime?.handleMidi?.(event, current.portId, node.state as any);
      }

      const outgoing = graph.connections.filter(
        (c) => c.kind === edgeKind && c.from.nodeId === current.nodeId,
      );
      for (const conn of outgoing) queue.push({ nodeId: conn.to.nodeId, portId: conn.to.portId });
    }
  }

  private teardownNode(nodeId: NodeId) {
    const n = this.audioNodes.get(nodeId);
    if (!n) return;
    n.onRemove?.();
    this.audioNodes.delete(nodeId);
  }

  private async ensureBuiltInWorkletsLoaded(ctx: AudioContext): Promise<void> {
    const urls = listBuiltInAudioWorkletModules();
    if (urls.length === 0) return;

    for (const url of urls) {
      if (this.loadedWorkletModules.has(url)) continue;
      await ctx.audioWorklet.addModule(url);
      this.loadedWorkletModules.add(url);
    }
  }
}

function rmsFromAnalyser(
  analyser: AnalyserNode,
  buffer: Float32Array<ArrayBufferLike>,
): number {
  analyser.getFloatTimeDomainData(buffer as any);
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const v = buffer[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / buffer.length);
}

declare global {
  // eslint-disable-next-line no-var
  var __webaudioPlaygroundEngine: AudioEngine | undefined;
}

export function getAudioEngine(): AudioEngine {
  globalThis.__webaudioPlaygroundEngine ??= new AudioEngine();
  return globalThis.__webaudioPlaygroundEngine;
}
