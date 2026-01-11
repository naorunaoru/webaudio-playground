import { PPQ } from "./types";

/** Convert PPQ position to seconds */
export function ppqToSeconds(ppq: number, tempo: number): number {
  return (ppq / PPQ) * (60 / tempo);
}

/** Convert seconds to PPQ position */
export function secondsToPPQ(seconds: number, tempo: number): number {
  return ((seconds * tempo) / 60) * PPQ;
}

/** Convert PPQ to beats (quarter notes) */
export function ppqToBeats(ppq: number): number {
  return ppq / PPQ;
}

/** Convert beats to PPQ */
export function beatsToPPQ(beats: number): number {
  return beats * PPQ;
}

/** Convert PPQ to bars */
export function ppqToBars(ppq: number, beatsPerBar: number): number {
  return ppq / (PPQ * beatsPerBar);
}

/** Convert bars to PPQ */
export function barsToPPQ(bars: number, beatsPerBar: number): number {
  return bars * PPQ * beatsPerBar;
}

/** Convert beats to seconds */
export function beatsToSeconds(beats: number, tempo: number): number {
  return (beats * 60) / tempo;
}

/** Convert seconds to beats */
export function secondsToBeats(seconds: number, tempo: number): number {
  return (seconds * tempo) / 60;
}

/** Convert MIDI note number to frequency in Hz */
export function midiToFreqHz(note: number, a4Hz: number): number {
  return a4Hz * Math.pow(2, (note - 69) / 12);
}

/** Convert frequency in Hz to MIDI note number (may be fractional) */
export function freqHzToMidi(hz: number, a4Hz: number): number {
  return 69 + 12 * Math.log2(hz / a4Hz);
}
