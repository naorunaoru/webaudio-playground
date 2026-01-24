import type { GraphNode, GraphState, MidiEvent, NodeId } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance, MidiHandleResult } from "@/types/audioRuntime";
import type { AudioNodeServices, DispatchMidiFn } from "@/types/nodeModule";
import type { ChordType } from "./types";

type MidiChordNode = Extract<GraphNode, { type: "midiChord" }>;

// Chord intervals in semitones from root
const CHORD_INTERVALS: Record<ChordType, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
  dominant7: [0, 4, 7, 10],
};

function createMidiChordRuntime(
  nodeId: NodeId,
  dispatchMidi: DispatchMidiFn
): AudioNodeInstance<MidiChordNode> {
  let currentState: MidiChordNode["state"] = { chordType: "major", staggerMs: 0 };
  let graphRef: GraphState | null = null;
  const pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();

  return {
    type: "midiChord",

    updateState: (state) => {
      currentState = state;
    },

    setGraphRef: (graph) => {
      graphRef = graph;
    },

    handleMidi: (event: MidiEvent, _portId: string | null): MidiHandleResult => {
      const intervals = CHORD_INTERVALS[currentState.chordType];
      const stagger = Math.abs(currentState.staggerMs);
      const reverse = currentState.staggerMs < 0;

      // Order intervals based on strum direction
      const orderedIntervals = reverse ? [...intervals].reverse() : intervals;

      if (event.type === "noteOn") {
        if (stagger === 0) {
          // No stagger - emit all notes at once
          const chordNotes: MidiEvent[] = orderedIntervals.map((interval) => ({
            type: "noteOn" as const,
            note: event.note + interval,
            velocity: event.velocity,
            channel: event.channel,
            atMs: event.atMs,
          }));
          return { consumed: true, emit: chordNotes };
        }

        // With stagger - emit first note immediately, schedule rest
        const firstNote: MidiEvent = {
          type: "noteOn",
          note: event.note + orderedIntervals[0],
          velocity: event.velocity,
          channel: event.channel,
          atMs: event.atMs,
        };

        // Schedule remaining notes
        for (let i = 1; i < orderedIntervals.length; i++) {
          const interval = orderedIntervals[i];
          const delay = i * stagger;
          const timeout = setTimeout(() => {
            pendingTimeouts.delete(timeout);
            if (!graphRef) return;
            const noteEvent: MidiEvent = {
              type: "noteOn",
              note: event.note + interval,
              velocity: event.velocity,
              channel: event.channel,
              atMs: performance.now(),
            };
            dispatchMidi(graphRef, nodeId, noteEvent);
          }, delay);
          pendingTimeouts.add(timeout);
        }

        return { consumed: true, emit: [firstNote] };
      }

      if (event.type === "noteOff") {
        if (stagger === 0) {
          // No stagger - release all notes at once
          const chordNotes: MidiEvent[] = orderedIntervals.map((interval) => ({
            type: "noteOff" as const,
            note: event.note + interval,
            channel: event.channel,
            atMs: event.atMs,
          }));
          return { consumed: true, emit: chordNotes };
        }

        // With stagger - release first note immediately, schedule rest
        const firstNote: MidiEvent = {
          type: "noteOff",
          note: event.note + orderedIntervals[0],
          channel: event.channel,
          atMs: event.atMs,
        };

        // Schedule remaining note-offs
        for (let i = 1; i < orderedIntervals.length; i++) {
          const interval = orderedIntervals[i];
          const delay = i * stagger;
          const timeout = setTimeout(() => {
            pendingTimeouts.delete(timeout);
            if (!graphRef) return;
            const noteEvent: MidiEvent = {
              type: "noteOff",
              note: event.note + interval,
              channel: event.channel,
              atMs: performance.now(),
            };
            dispatchMidi(graphRef, nodeId, noteEvent);
          }, delay);
          pendingTimeouts.add(timeout);
        }

        return { consumed: true, emit: [firstNote] };
      }

      // Pass through other events (like CC)
      return {};
    },

    onRemove: () => {
      // Clear any pending timeouts
      for (const timeout of pendingTimeouts) {
        clearTimeout(timeout);
      }
      pendingTimeouts.clear();
    },
  };
}

export function midiChordAudioFactory(
  services: AudioNodeServices
): AudioNodeFactory<MidiChordNode> {
  return {
    type: "midiChord",
    create: (_ctx, nodeId) => createMidiChordRuntime(nodeId, services.dispatchMidi),
  };
}
