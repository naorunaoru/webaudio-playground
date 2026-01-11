import { NumericInput, type NumericInputProps } from "./NumericInput";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/**
 * Convert MIDI note number (0-127) to traditional notation (e.g., C-1, C4, G9)
 * MIDI note 0 = C-1, MIDI note 60 = C4, MIDI note 127 = G9
 */
function midiToNoteName(midi: number): string {
  const note = Math.round(midi);
  const octave = Math.floor(note / 12) - 1;
  const noteName = NOTE_NAMES[note % 12];
  return `${noteName}${octave}`;
}

/**
 * Parse traditional notation (e.g., C4, C#4, Db4) to MIDI note number
 * Returns NaN if parsing fails
 */
function noteNameToMidi(input: string): number {
  const normalized = input.trim().toUpperCase();

  // Match note name (with optional sharp/flat) and octave
  const match = normalized.match(/^([A-G])([#B]?)(-?\d+)$/);
  if (!match) return NaN;

  const [, noteLetter, accidental, octaveStr] = match;
  const octave = parseInt(octaveStr, 10);

  // Find base note index
  let noteIndex = NOTE_NAMES.indexOf(noteLetter as typeof NOTE_NAMES[number]);
  if (noteIndex === -1) return NaN;

  // Apply accidental
  if (accidental === "#") {
    noteIndex += 1;
  } else if (accidental === "B") {
    // B = flat
    noteIndex -= 1;
  }

  // Handle wrap-around for accidentals (e.g., Cb = B, B# = C)
  if (noteIndex < 0) noteIndex += 12;
  if (noteIndex > 11) noteIndex -= 12;

  // Calculate MIDI note: (octave + 1) * 12 + noteIndex
  const midi = (octave + 1) * 12 + noteIndex;

  return midi;
}

export interface MidiNoteInputProps extends Omit<NumericInputProps, "min" | "max" | "step" | "format" | "parse"> {
  /** Optional: override min MIDI note (default: 0) */
  min?: number;
  /** Optional: override max MIDI note (default: 127) */
  max?: number;
}

/**
 * A specialized NumericInput for MIDI note values.
 * Displays notes in traditional notation (C4, G#5, etc.) instead of raw MIDI numbers.
 * Supports both dragging to change values and direct text entry with note names.
 */
export function MidiNoteInput({
  min = 0,
  max = 127,
  ...props
}: MidiNoteInputProps) {
  return (
    <NumericInput
      {...props}
      min={min}
      max={max}
      step={1}
      format={midiToNoteName}
      parse={noteNameToMidi}
    />
  );
}
