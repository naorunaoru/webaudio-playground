import { getSoundfontBlob } from "./soundfontStore";

class SoundfontManager {
  private cache = new Map<string, Promise<ArrayBuffer>>();

  getBuffer(soundfontId: string): Promise<ArrayBuffer> {
    const cached = this.cache.get(soundfontId);
    if (cached) return cached;

    const p = (async () => {
      const blob = await getSoundfontBlob(soundfontId);
      if (!blob) throw new Error(`Soundfont not found: ${soundfontId}`);
      return await blob.arrayBuffer();
    })();

    p.catch(() => this.cache.delete(soundfontId));
    this.cache.set(soundfontId, p);
    return p;
  }

  invalidate(soundfontId?: string) {
    if (!soundfontId) this.cache.clear();
    else this.cache.delete(soundfontId);
  }
}

let instance: SoundfontManager | null = null;

export function getSoundfontManager(): SoundfontManager {
  if (!instance) instance = new SoundfontManager();
  return instance;
}
