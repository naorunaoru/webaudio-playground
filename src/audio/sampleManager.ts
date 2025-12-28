import { getSampleBlob } from "./sampleStore";

class SampleManager {
  private cache = new Map<string, Promise<AudioBuffer>>();

  constructor(private readonly ctx: AudioContext) {}

  getBuffer(sampleId: string): Promise<AudioBuffer> {
    const cached = this.cache.get(sampleId);
    if (cached) return cached;

    const p = (async () => {
      const blob = await getSampleBlob(sampleId);
      if (!blob) throw new Error(`Sample not found: ${sampleId}`);
      const bytes = await blob.arrayBuffer();
      const ab = bytes.slice(0);
      return await this.ctx.decodeAudioData(ab);
    })();

    // If it fails once, allow retry next time.
    p.catch(() => this.cache.delete(sampleId));
    this.cache.set(sampleId, p);
    return p;
  }

  invalidate(sampleId?: string) {
    if (!sampleId) this.cache.clear();
    else this.cache.delete(sampleId);
  }
}

const MANAGERS = new WeakMap<AudioContext, SampleManager>();

export function getSampleManager(ctx: AudioContext): SampleManager {
  const existing = MANAGERS.get(ctx);
  if (existing) return existing;
  const created = new SampleManager(ctx);
  MANAGERS.set(ctx, created);
  return created;
}

