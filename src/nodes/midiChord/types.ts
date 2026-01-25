export type ChordType =
  | "major"
  | "minor"
  | "diminished"
  | "augmented"
  | "sus2"
  | "sus4"
  | "major7"
  | "minor7"
  | "dominant7";

export type MidiChordState = {
  chordType: ChordType;
  /** Stagger time between notes in ms (positive = up strum, negative = down strum) */
  staggerMs: number;
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    midiChord: MidiChordState;
  }
}
