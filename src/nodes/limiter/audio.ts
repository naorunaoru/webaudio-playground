import type { GraphNode, NodeId } from "../../graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "../../types/audioRuntime";
import type { AudioNodeServices } from "../../types/nodeModule";
import limiterProcessorUrl from "./processor.ts?url";
import limiterWasmUrl from "./limiter.wasm?url";

type LimiterGraphNode = Extract<GraphNode, { type: "limiter" }>;

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function dataUrlToArrayBuffer(url: string): ArrayBuffer {
  const prefix = "base64,";
  const idx = url.indexOf(prefix);
  if (idx === -1) throw new Error("Unsupported data URL");
  return base64ToArrayBuffer(url.slice(idx + prefix.length));
}

let limiterWasmBytesPromise: Promise<ArrayBuffer | null> | null = null;
function loadLimiterWasmBytes(): Promise<ArrayBuffer | null> {
  limiterWasmBytesPromise ??= (async () => {
    try {
      if (limiterWasmUrl.startsWith("data:")) return dataUrlToArrayBuffer(limiterWasmUrl);
      const res = await fetch(limiterWasmUrl);
      if (!res.ok) return null;
      return await res.arrayBuffer();
    } catch {
      return null;
    }
  })();
  return limiterWasmBytesPromise;
}

const workletModuleLoadByContext = new WeakMap<AudioContext, Promise<void>>();

function ensureLimiterWorkletModuleLoaded(ctx: AudioContext): Promise<void> {
  const existing = workletModuleLoadByContext.get(ctx);
  if (existing) return existing;
  const p = ctx.audioWorklet.addModule(limiterProcessorUrl);
  workletModuleLoadByContext.set(ctx, p);
  return p;
}

function rmsFromAnalyser(analyser: AnalyserNode, buffer: Float32Array<ArrayBufferLike>): number {
  analyser.getFloatTimeDomainData(buffer as any);
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const v = buffer[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / buffer.length);
}

function createLimiterRuntime(ctx: AudioContext, _nodeId: NodeId): AudioNodeInstance<LimiterGraphNode> {
  const input = ctx.createGain();
  const output = ctx.createGain();

  const meter = ctx.createAnalyser();
  meter.fftSize = 256;
  meter.smoothingTimeConstant = 0.6;
  const meterBuffer = new Float32Array(meter.fftSize) as Float32Array<ArrayBufferLike>;

  let worklet: AudioWorkletNode | null = null;
  let currentChannels: 1 | 2 = 2;
  let desiredChannels: 1 | 2 = 2;
  let disposed = false;
  let initPromise: Promise<void> | null = null;

  const debug = {
    module: "loading" as "loading" | "ready" | "error",
    worklet: "none" as "none" | "ready" | "error",
    wasm: "loading" as "loading" | "ready" | "missing" | "error",
    cpuLoad: 0,
  };

  const params = {
    ceilingDb: -0.3,
    releaseMs: 120,
    makeupDb: 0,
    bypass: false,
    stereoLink: true,
  };

  input.connect(output);
  output.connect(meter);

  const connectPassthrough = () => {
    try {
      input.disconnect();
    } catch {
      // ignore
    }
    input.connect(output);
  };

  const connectWorklet = (node: AudioWorkletNode) => {
    try {
      input.disconnect();
    } catch {
      // ignore
    }
    try {
      worklet?.disconnect();
    } catch {
      // ignore
    }
    input.connect(node);
    node.connect(output);
    worklet = node;
    debug.worklet = "ready";
    node.port.onmessage = (event: MessageEvent<any>) => {
      const data = event.data as any;
      if (!data) return;
      if (data.type === "status") {
        if (data.worklet === "ready") debug.worklet = "ready";
        if (data.worklet === "error") debug.worklet = "error";
        if (typeof data.wasm === "string") debug.wasm = data.wasm;
        return;
      }
      if (data.type === "cpu" && typeof data.load === "number") {
        debug.cpuLoad = Math.max(0, data.load);
      }
    };
  };

  const buildWorklet = (channelCount: 1 | 2) => {
    const node = new AudioWorkletNode(ctx, "limiter", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCountMode: "explicit",
      channelCount,
      outputChannelCount: [channelCount],
      processorOptions: {},
    });
    currentChannels = channelCount;
    connectWorklet(node);
  };

  const pushParams = () => {
    worklet?.port.postMessage({
      type: "params",
      params: {
        ceilingDb: params.ceilingDb,
        releaseMs: params.releaseMs,
        makeupDb: params.makeupDb,
        bypass: params.bypass,
        stereoLink: params.stereoLink,
      },
    });
  };

  const ensureWorkletReady = () => {
    if (disposed) return;
    initPromise ??= ensureLimiterWorkletModuleLoaded(ctx)
      .then(() => {
        if (disposed) return;
        debug.module = "ready";
        return loadLimiterWasmBytes().then((wasmBytes) => {
          if (disposed) return;
          if (!wasmBytes) {
            debug.wasm = "missing";
            connectPassthrough();
            return;
          }
          debug.wasm = "ready";
          const node = new AudioWorkletNode(ctx, "limiter", {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            channelCountMode: "explicit",
            channelCount: desiredChannels,
            outputChannelCount: [desiredChannels],
            processorOptions: { wasmBytes },
          });
          currentChannels = desiredChannels;
          connectWorklet(node);
          pushParams();
        });
      })
      .catch(() => {
        // If module load fails, keep passthrough.
        debug.module = "error";
        debug.worklet = "error";
        debug.wasm = "error";
        connectPassthrough();
      });
  };

  ensureWorkletReady();

  return {
    type: "limiter",
    updateState: (state) => {
      const nextChannels = state.channelCount === 1 ? 1 : 2;
      desiredChannels = nextChannels;

      params.ceilingDb = clamp(state.ceilingDb, -60, 0);
      params.releaseMs = clamp(state.releaseMs, 1, 5000);
      params.makeupDb = clamp(state.makeupDb, -24, 24);
      params.bypass = !!state.bypass;
      params.stereoLink = nextChannels === 2 ? !!state.stereoLink : false;

      if (!worklet) {
        ensureWorkletReady();
        return;
      }

      if (nextChannels !== currentChannels) {
        // Rebuild the node to change channel config; reuse previously loaded WASM bytes.
        loadLimiterWasmBytes()
          .then((wasmBytes) => {
            if (disposed) return;
            if (!wasmBytes) {
              debug.wasm = "missing";
              connectPassthrough();
              return;
            }
            debug.wasm = "ready";
            const node = new AudioWorkletNode(ctx, "limiter", {
              numberOfInputs: 1,
              numberOfOutputs: 1,
              channelCountMode: "explicit",
              channelCount: nextChannels,
              outputChannelCount: [nextChannels],
              processorOptions: { wasmBytes },
            });
            currentChannels = nextChannels;
            connectWorklet(node);
            pushParams();
          })
          .catch(() => {
            debug.wasm = "error";
            connectPassthrough();
          });
        return;
      }

      pushParams();
    },
    getAudioInput: (portId) => {
      if (portId === "audio_in") return input;
      return null;
    },
    getAudioOutput: (portId) => {
      if (portId === "audio_out") return meter;
      return null;
    },
    onRemove: () => {
      disposed = true;
      try {
        meter.disconnect();
      } catch {
        // ignore
      }
      try {
        worklet?.disconnect();
      } catch {
        // ignore
      }
      try {
        output.disconnect();
      } catch {
        // ignore
      }
      try {
        input.disconnect();
      } catch {
        // ignore
      }
      worklet = null;
    },
    getLevel: () => rmsFromAnalyser(meter, meterBuffer),
    getDebug: () => debug,
  };
}

export function limiterAudioFactory(_services: AudioNodeServices): AudioNodeFactory<LimiterGraphNode> {
  return {
    type: "limiter",
    create: (ctx, nodeId) => createLimiterRuntime(ctx, nodeId),
  };
}
