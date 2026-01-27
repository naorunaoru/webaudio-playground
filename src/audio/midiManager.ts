import { getMidiBlob } from "./midiStore";
import { parseMidiFile, type ParsedMidi } from "./midiParser";

class MidiManager {
  private cache = new Map<string, Promise<ParsedMidi>>();

  getParsedMidi(midiId: string): Promise<ParsedMidi> {
    const cached = this.cache.get(midiId);
    if (cached) return cached;

    const promise = (async () => {
      const blob = await getMidiBlob(midiId);
      if (!blob) {
        throw new Error(`MIDI file not found: ${midiId}`);
      }
      const buffer = await blob.arrayBuffer();
      return parseMidiFile(buffer);
    })();

    // Remove from cache if parsing fails
    promise.catch(() => {
      this.cache.delete(midiId);
    });

    this.cache.set(midiId, promise);
    return promise;
  }

  invalidate(midiId?: string): void {
    if (midiId) {
      this.cache.delete(midiId);
    } else {
      this.cache.clear();
    }
  }
}

let midiManager: MidiManager | null = null;

export function getMidiManager(): MidiManager {
  if (!midiManager) {
    midiManager = new MidiManager();
  }
  return midiManager;
}
