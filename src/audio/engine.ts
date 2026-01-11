import type {
  GraphConnection,
  GraphNode,
  GraphState,
  MidiEvent,
  NodeId,
} from "../graph/types";
import {
  createBuiltInAudioNodeFactories,
  listBuiltInAudioWorkletModules,
} from "./nodeRegistry";
import type { AudioNodeFactoryMap } from "./nodeRegistry";
import type {
  AudioNodeFactory,
  AudioNodeInstance,
} from "../types/audioRuntime";
import {
  AudioGraphContextImpl,
  DEFAULT_CONTEXT_VALUES,
  type AudioGraphContext,
  type AudioGraphEvent,
  type PersistedContextValues,
} from "./context";

export type EngineStatus = {
  state: AudioContextState;
  sampleRate: number;
};

export type MidiDispatchEvent = {
  nodeId: NodeId;
  event: MidiEvent;
};

export type MidiDispatchListener = (evt: MidiDispatchEvent) => void;

function connectionKey(conn: GraphConnection): string {
  return `${conn.from.nodeId}:${conn.from.portId}->${conn.to.nodeId}:${conn.to.portId}`;
}

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
  private midiListeners = new Set<MidiDispatchListener>();
  /** Tracks active audio/automation connections for incremental sync */
  private activeConnections = new Map<string, GraphConnection>();
  /** Tracks which ports are connected for each node */
  private connectedPorts = new Map<
    NodeId,
    { inputs: Set<string>; outputs: Set<string> }
  >();
  /** Root context for global values (tempo, A4, etc.) */
  private rootContext: AudioGraphContextImpl;

  constructor() {
    // Initialize with defaults; sampleRate will be set when AudioContext is created
    this.rootContext = new AudioGraphContextImpl(DEFAULT_CONTEXT_VALUES);
  }

  /** Get the root audio graph context */
  getGraphContext(): AudioGraphContext {
    return this.rootContext;
  }

  /** Update context values (e.g., from persisted document) */
  updateContextValues(values: Partial<PersistedContextValues>): void {
    if (values.a4Hz !== undefined) {
      this.rootContext.setValue("a4Hz", values.a4Hz);
    }
    if (values.tempo !== undefined) {
      this.rootContext.setValue("tempo", values.tempo);
    }
    if (values.timeSignature !== undefined) {
      this.rootContext.setValue("timeSignature", values.timeSignature);
    }
  }

  /** Set tempo (convenience method, also emits event) */
  setTempo(bpm: number): void {
    this.rootContext.emit({ type: "tempoChange", tempo: bpm });
  }

  /** Set A4 reference frequency (convenience method, also emits event) */
  setA4(hz: number): void {
    this.rootContext.emit({ type: "a4Change", a4Hz: hz });
  }

  /** Set time signature (convenience method, also emits event) */
  setTimeSignature(timeSignature: readonly [number, number]): void {
    this.rootContext.emit({ type: "timeSignatureChange", timeSignature });
  }

  /** Emit a context event */
  emitContextEvent(event: AudioGraphEvent): void {
    this.rootContext.emit(event);
  }

  onMidiDispatch(listener: MidiDispatchListener): () => void {
    this.midiListeners.add(listener);
    return () => this.midiListeners.delete(listener);
  }

  private emitMidiDispatch(nodeId: NodeId, event: MidiEvent): void {
    const evt: MidiDispatchEvent = { nodeId, event };
    for (const listener of this.midiListeners) {
      try {
        listener(evt);
      } catch (e) {
        console.error("MIDI dispatch listener error:", e);
      }
    }
  }

  getStatus(): EngineStatus | null {
    if (!this.audioContext) return null;
    return {
      state: this.audioContext.state,
      sampleRate: this.audioContext.sampleRate,
    };
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

  getRuntimeState(): Record<NodeId, unknown> {
    const out: Record<NodeId, unknown> = {};
    for (const [id, n] of this.audioNodes) {
      if (n.getRuntimeState) out[id] = n.getRuntimeState();
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
      this.masterMeterBuffer = new Float32Array(
        this.masterMeter.fftSize
      ) as Float32Array<ArrayBufferLike>;
      this.masterGain.connect(this.masterMeter);
      this.masterMeter.connect(this.audioContext.destination);

      // Update context with actual sample rate
      this.rootContext.setValue("sampleRate", this.audioContext.sampleRate);

      this.factories = {
        ...createBuiltInAudioNodeFactories({
          masterInput: this.masterGain,
          graphContext: this.rootContext,
        }),
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
    factory: AudioNodeFactory<any>
  ) {
    this.factoryOverrides[type] = factory;
    if (this.factories) this.factories[type] = factory;
  }

  /**
   * Disconnect a specific audio/automation connection without affecting others.
   */
  private disconnectConnection(conn: GraphConnection): void {
    if (conn.kind !== "audio" && conn.kind !== "automation") return;

    const from = this.audioNodes.get(conn.from.nodeId);
    const to = this.audioNodes.get(conn.to.nodeId);
    if (!from || !to) return;

    const output = from.getAudioOutput?.(conn.from.portId);
    const input = to.getAudioInput?.(conn.to.portId);
    if (output && input) {
      try {
        output.disconnect(input as AudioNode);
      } catch {
        // Connection may not exist, ignore
      }
    }
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

    this.outputNodeIds = new Set(
      graph.nodes.filter((n) => n.type === "audioOut").map((n) => n.id)
    );

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

    // Build set of desired audio/automation connections
    const desiredConnections = new Map<string, GraphConnection>();
    for (const conn of graph.connections) {
      if (conn.kind !== "audio" && conn.kind !== "automation") continue;
      desiredConnections.set(connectionKey(conn), conn);
    }

    // Disconnect removed connections
    for (const [key, conn] of this.activeConnections) {
      if (!desiredConnections.has(key)) {
        this.disconnectConnection(conn);
        this.activeConnections.delete(key);
      }
    }

    // Connect new connections
    for (const [key, conn] of desiredConnections) {
      if (this.activeConnections.has(key)) continue;
      const from = this.audioNodes.get(conn.from.nodeId);
      const to = this.audioNodes.get(conn.to.nodeId);
      if (!from || !to) continue;
      const out = from.getAudioOutput?.(conn.from.portId);
      const input = to.getAudioInput?.(conn.to.portId);
      if (out && input) {
        out.connect(input as AudioNode);
        this.activeConnections.set(key, conn);
      }
    }

    // Build current port connections per node and notify if changed
    const newConnectedPorts = new Map<
      NodeId,
      { inputs: Set<string>; outputs: Set<string> }
    >();
    const getOrCreate = (nodeId: NodeId) => {
      let entry = newConnectedPorts.get(nodeId);
      if (!entry) {
        entry = { inputs: new Set(), outputs: new Set() };
        newConnectedPorts.set(nodeId, entry);
      }
      return entry;
    };
    for (const conn of desiredConnections.values()) {
      getOrCreate(conn.to.nodeId).inputs.add(conn.to.portId);
      getOrCreate(conn.from.nodeId).outputs.add(conn.from.portId);
    }

    // Notify nodes whose connections have changed
    const setsEqual = (a: Set<string>, b: Set<string>) => {
      if (a.size !== b.size) return false;
      for (const p of a) {
        if (!b.has(p)) return false;
      }
      return true;
    };
    const emptySet = new Set<string>();
    for (const nodeId of alive) {
      const oldEntry = this.connectedPorts.get(nodeId);
      const newEntry = newConnectedPorts.get(nodeId);
      const oldInputs = oldEntry?.inputs ?? emptySet;
      const oldOutputs = oldEntry?.outputs ?? emptySet;
      const newInputs = newEntry?.inputs ?? emptySet;
      const newOutputs = newEntry?.outputs ?? emptySet;

      if (
        !setsEqual(oldInputs, newInputs) ||
        !setsEqual(oldOutputs, newOutputs)
      ) {
        const instance = this.audioNodes.get(nodeId);
        instance?.onConnectionsChanged?.({
          inputs: newInputs,
          outputs: newOutputs,
        });
      }
    }
    this.connectedPorts = newConnectedPorts;
  }

  dispatchMidi(
    graph: GraphState,
    sourceNodeId: NodeId,
    event: MidiEvent,
    stateOverrides?: ReadonlyMap<NodeId, Record<string, unknown>>
  ): void {
    const ctx = this.audioContext;
    if (!ctx) return;

    const seen = new Set<string>();
    const queue: Array<{ nodeId: NodeId; portId: string | null }> = [];

    const edgeKind = event.type === "cc" ? "cc" : "midi";
    const starts = graph.connections.filter(
      (c) => c.kind === edgeKind && c.from.nodeId === sourceNodeId
    );
    for (const conn of starts)
      queue.push({ nodeId: conn.to.nodeId, portId: conn.to.portId });

    while (queue.length > 0) {
      const current = queue.shift()!;
      const key = `${current.nodeId}:${current.portId ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const node = graph.nodes.find((n) => n.id === current.nodeId);
      if (node) {
        const runtime = this.audioNodes.get(node.id);
        const override = stateOverrides?.get(node.id);
        const effectiveState =
          override && Object.keys(override).length > 0
            ? ({ ...node.state, ...override } as any)
            : (node.state as any);
        runtime?.handleMidi?.(event, current.portId, effectiveState);
        this.emitMidiDispatch(current.nodeId, event);
      }

      const outgoing = graph.connections.filter(
        (c) => c.kind === edgeKind && c.from.nodeId === current.nodeId
      );
      for (const conn of outgoing)
        queue.push({ nodeId: conn.to.nodeId, portId: conn.to.portId });
    }
  }

  /**
   * Send MIDI directly to a specific node without routing through graph connections.
   * Used by control surfaces like the piano keyboard.
   */
  dispatchMidiDirect(
    graph: GraphState,
    targetNodeId: NodeId,
    event: MidiEvent
  ): void {
    const ctx = this.audioContext;
    if (!ctx) return;

    const node = graph.nodes.find((n) => n.id === targetNodeId);
    if (!node) return;

    const runtime = this.audioNodes.get(node.id);
    runtime?.handleMidi?.(event, null, node.state as any);
    this.emitMidiDispatch(targetNodeId, event);
  }

  private teardownNode(nodeId: NodeId) {
    const n = this.audioNodes.get(nodeId);
    if (!n) return;
    n.onRemove?.();
    this.audioNodes.delete(nodeId);
    // Clean up connection tracking for this node
    for (const [key, conn] of this.activeConnections) {
      if (conn.from.nodeId === nodeId || conn.to.nodeId === nodeId) {
        this.activeConnections.delete(key);
      }
    }
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
  buffer: Float32Array<ArrayBufferLike>
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
