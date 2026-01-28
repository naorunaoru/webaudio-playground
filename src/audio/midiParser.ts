import { parseArrayBuffer } from "midi-json-parser";

export type MidiNote = {
  tick: number;
  duration: number;
  note: number;
  velocity: number;
  channel: number;
};

export type MidiControlChange = {
  tick: number;
  controller: number;
  value: number;
  channel: number;
};

export type MidiPitchBend = {
  tick: number;
  value: number; // -8192 to 8191
  channel: number;
};

export type MidiProgramChange = {
  tick: number;
  program: number; // 0..127
  channel: number;
};

export type MidiTempoChange = {
  tick: number;
  bpm: number;
};

export type MidiTrack = {
  name?: string;
  notes: MidiNote[];
  controlChanges: MidiControlChange[];
  pitchBends: MidiPitchBend[];
  programChanges: MidiProgramChange[];
};

export type ParsedMidi = {
  ticksPerBeat: number;
  trackCount: number;
  durationTicks: number;
  tracks: MidiTrack[];
  tempoChanges: MidiTempoChange[];
};

type NoteOnState = {
  tick: number;
  velocity: number;
};

export async function parseMidiFile(buffer: ArrayBuffer): Promise<ParsedMidi> {
  const midiFile = await parseArrayBuffer(buffer);

  const ticksPerBeat = midiFile.division;
  const tracks: MidiTrack[] = [];
  const tempoChanges: MidiTempoChange[] = [];
  let maxTick = 0;

  for (const track of midiFile.tracks) {
    let currentTick = 0;
    const parsedTrack: MidiTrack = {
      notes: [],
      controlChanges: [],
      pitchBends: [],
      programChanges: [],
    };

    // Track note-on events waiting for note-off
    const activeNotes = new Map<string, NoteOnState>();

    for (const event of track) {
      currentTick += event.delta;

      // Extract track name
      if ("trackName" in event) {
        parsedTrack.name = event.trackName as string;
      }

      // Tempo change (in meta events)
      if ("setTempo" in event) {
        const microsecondsPerBeat = (event as { setTempo: { microsecondsPerQuarter: number } }).setTempo.microsecondsPerQuarter;
        const bpm = 60_000_000 / microsecondsPerBeat;
        tempoChanges.push({ tick: currentTick, bpm });
      }

      // Note on
      if ("noteOn" in event) {
        const noteOn = event.noteOn as { noteNumber: number; velocity: number };
        const channel = (event as { channel: number }).channel;

        // Velocity 0 is equivalent to note-off
        if (noteOn.velocity === 0) {
          const key = `${channel}-${noteOn.noteNumber}`;
          const noteOnState = activeNotes.get(key);
          if (noteOnState) {
            parsedTrack.notes.push({
              tick: noteOnState.tick,
              duration: currentTick - noteOnState.tick,
              note: noteOn.noteNumber,
              velocity: noteOnState.velocity,
              channel,
            });
            activeNotes.delete(key);
          }
        } else {
          const key = `${channel}-${noteOn.noteNumber}`;
          activeNotes.set(key, { tick: currentTick, velocity: noteOn.velocity });
        }
      }

      // Note off
      if ("noteOff" in event) {
        const noteOff = event.noteOff as { noteNumber: number };
        const channel = (event as { channel: number }).channel;
        const key = `${channel}-${noteOff.noteNumber}`;
        const noteOnState = activeNotes.get(key);
        if (noteOnState) {
          parsedTrack.notes.push({
            tick: noteOnState.tick,
            duration: currentTick - noteOnState.tick,
            note: noteOff.noteNumber,
            velocity: noteOnState.velocity,
            channel,
          });
          activeNotes.delete(key);
        }
      }

      // Control change
      if ("controlChange" in event) {
        const cc = event.controlChange as { type: number; value: number };
        const channel = (event as { channel: number }).channel;
        parsedTrack.controlChanges.push({
          tick: currentTick,
          controller: cc.type,
          value: cc.value,
          channel,
        });
      }

      // Pitch bend
      if ("pitchBend" in event) {
        // midi-json-parser returns 0-16383, convert to -8192..8191 for consistency
        const raw = event.pitchBend as number;
        const channel = (event as { channel: number }).channel;
        parsedTrack.pitchBends.push({
          tick: currentTick,
          value: raw - 8192,
          channel,
        });
      }

      // Program change
      if ("programChange" in event) {
        const pc = event.programChange as { programNumber: number };
        const channel = (event as { channel: number }).channel;
        parsedTrack.programChanges.push({
          tick: currentTick,
          program: pc.programNumber,
          channel,
        });
      }
    }

    maxTick = Math.max(maxTick, currentTick);
    tracks.push(parsedTrack);
  }

  // Sort tempo changes by tick
  tempoChanges.sort((a, b) => a.tick - b.tick);

  // Add default tempo if none specified
  if (tempoChanges.length === 0) {
    tempoChanges.push({ tick: 0, bpm: 120 });
  }

  return {
    ticksPerBeat,
    trackCount: tracks.length,
    durationTicks: maxTick,
    tracks,
    tempoChanges,
  };
}
