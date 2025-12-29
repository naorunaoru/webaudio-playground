type LimiterParams = Readonly<{
  ceilingDb: number;
  releaseMs: number;
  makeupDb: number;
  bypass: boolean;
  stereoLink: boolean;
}>;

type WasmExports = {
  readonly memory: WebAssembly.Memory;
  limiter_new: (sampleRateHz: number) => number;
  limiter_free: (ptr: number) => void;
  limiter_set_params: (
    ptr: number,
    ceilingDb: number,
    releaseMs: number,
    makeupDb: number,
    bypass: number,
    stereoLink: number
  ) => void;
  limiter_process_interleaved: (
    ptr: number,
    inPtr: number,
    outPtr: number,
    frames: number,
    channels: number
  ) => void;
  wasm_alloc: (bytes: number) => number;
  wasm_free: (ptr: number, bytes: number) => void;
};

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function nowMs(): number {
  const p = (globalThis as any).performance;
  if (p && typeof p.now === "function") return p.now();
  const d = (globalThis as any).Date;
  if (d && typeof d.now === "function") return d.now();
  return 0;
}

class LimiterProcessor extends AudioWorkletProcessor {
  private ceilingDb = -0.3;
  private releaseMs = 120;
  private makeupDb = 0;

  private bypass = false;
  private stereoLink = true;

  private cpuEma = 0;
  private cpuEmaInitialized = false;
  private cpuPostCountdown = 0;

  private wasm: WasmExports | null = null;
  private wasmLimiterPtr = 0;
  private wasmInPtr = 0;
  private wasmOutPtr = 0;
  private wasmCapacityFloats = 0;

  constructor(options?: any) {
    super();

    const wasmBytes = options?.processorOptions?.wasmBytes as
      | ArrayBuffer
      | undefined;
    this.port.postMessage({
      type: "status",
      worklet: "ready",
      wasm: wasmBytes ? "loading" : "missing",
    });
    if (wasmBytes) this.initWasm(wasmBytes);

    this.port.onmessage = (event: MessageEvent<any>) => {
      const data = event.data as {
        type?: string;
        params?: Partial<LimiterParams>;
      } | null;
      if (!data || data.type !== "params" || !data.params) return;
      this.applyParams(data.params);
    };
  }

  private async initWasm(wasmBytes: ArrayBuffer) {
    try {
      const { instance } = await WebAssembly.instantiate(wasmBytes, {});
      const exports = instance.exports as any as WasmExports;
      if (!exports?.memory || !exports.limiter_new) return;
      this.wasm = exports;
      this.wasmLimiterPtr = exports.limiter_new(sampleRate);
      exports.limiter_set_params(
        this.wasmLimiterPtr,
        this.ceilingDb,
        this.releaseMs,
        this.makeupDb,
        this.bypass ? 1 : 0,
        this.stereoLink ? 1 : 0
      );
      // Pre-allocate buffers off the audio thread (process()).
      this.ensureWasmBuffers(128, 2);
      this.port.postMessage({
        type: "status",
        worklet: "ready",
        wasm: "ready",
      });
    } catch {
      this.wasm = null;
      this.port.postMessage({
        type: "status",
        worklet: "ready",
        wasm: "error",
      });
    }
  }

  private applyParams(patch: Partial<LimiterParams>) {
    if (patch.ceilingDb != null) {
      this.ceilingDb = clamp(patch.ceilingDb, -60, 0);
    }
    if (patch.makeupDb != null) {
      this.makeupDb = clamp(patch.makeupDb, -24, 24);
    }
    if (patch.releaseMs != null) {
      this.releaseMs = clamp(patch.releaseMs, 1, 5000);
    }
    if (patch.bypass != null) this.bypass = !!patch.bypass;
    if (patch.stereoLink != null) this.stereoLink = !!patch.stereoLink;

    if (this.wasm && this.wasmLimiterPtr) {
      this.wasm.limiter_set_params(
        this.wasmLimiterPtr,
        this.ceilingDb,
        this.releaseMs,
        this.makeupDb,
        this.bypass ? 1 : 0,
        this.stereoLink ? 1 : 0
      );
    }
  }

  private ensureWasmBuffers(frames: number, channels: number): boolean {
    const wasm = this.wasm;
    if (!wasm || !this.wasmLimiterPtr) return false;
    const neededFloats = Math.max(0, frames * channels);
    if (
      neededFloats <= this.wasmCapacityFloats &&
      this.wasmInPtr &&
      this.wasmOutPtr
    )
      return true;

    if (this.wasmInPtr && this.wasmCapacityFloats)
      wasm.wasm_free(this.wasmInPtr, this.wasmCapacityFloats * 4);
    if (this.wasmOutPtr && this.wasmCapacityFloats)
      wasm.wasm_free(this.wasmOutPtr, this.wasmCapacityFloats * 4);

    this.wasmCapacityFloats = Math.max(neededFloats, 128 * 2);
    this.wasmInPtr = wasm.wasm_alloc(this.wasmCapacityFloats * 4);
    this.wasmOutPtr = wasm.wasm_alloc(this.wasmCapacityFloats * 4);
    return !!this.wasmInPtr && !!this.wasmOutPtr;
  }

  private processWithWasm(
    input: Float32Array[],
    output: Float32Array[],
    frames: number,
    channels: number
  ): boolean {
    const wasm = this.wasm;
    if (!wasm) return false;
    if (!this.ensureWasmBuffers(frames, channels)) return false;

    const memF32 = new Float32Array(wasm.memory.buffer);
    const inBase = this.wasmInPtr >>> 2;
    const outBase = this.wasmOutPtr >>> 2;

    let idx = 0;
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < channels; c++)
        memF32[inBase + idx++] = input[c]![i] ?? 0;
    }

    wasm.limiter_process_interleaved(
      this.wasmLimiterPtr,
      this.wasmInPtr,
      this.wasmOutPtr,
      frames,
      channels
    );

    idx = 0;
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < channels; c++)
        output[c]![i] = memF32[outBase + idx++] ?? 0;
    }

    return true;
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>
  ): boolean {
    const t0 = nowMs();
    const input = inputs[0];
    const output = outputs[0];
    if (!output) return true;

    const outputChannels = output.length;
    const frames = outputChannels > 0 ? output[0]!.length : 0;

    if (!input || input.length === 0 || frames === 0) {
      for (let c = 0; c < outputChannels; c++) output[c]!.fill(0);
      this.noteCpu(t0, frames);
      return true;
    }

    const channels = Math.min(input.length, outputChannels);
    for (let c = channels; c < outputChannels; c++) output[c]!.fill(0);

    if (this.bypass) {
      for (let c = 0; c < channels; c++) output[c]!.set(input[c]!);
      this.noteCpu(t0, frames);
      return true;
    }

    const ok = this.processWithWasm(input, output, frames, channels);
    if (!ok) {
      // Until WASM is ready (or if it failed to init), pass through.
      for (let c = 0; c < channels; c++) output[c]!.set(input[c]!);
    }
    this.noteCpu(t0, frames);
    return true;
  }

  private noteCpu(t0: number, frames: number) {
    const t1 = nowMs();
    const elapsedMs = Math.max(0, t1 - t0);
    const bufferMs = frames > 0 ? (frames / sampleRate) * 1000 : 0;
    const load = bufferMs > 0 ? elapsedMs / bufferMs : 0;

    const alpha = 0.12;
    if (!this.cpuEmaInitialized) {
      this.cpuEma = load;
      this.cpuEmaInitialized = true;
    } else {
      this.cpuEma = this.cpuEma + alpha * (load - this.cpuEma);
    }

    // Post at ~10Hz (128-frame quanta => ~375Hz at 48k).
    if (this.cpuPostCountdown-- <= 0) {
      this.cpuPostCountdown = 36;
      this.port.postMessage({
        type: "cpu",
        load: this.cpuEma,
      });
    }
  }
}

registerProcessor("limiter", LimiterProcessor);
