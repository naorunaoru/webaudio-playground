import type { GraphNode, GraphState, MidiEvent, NodeId } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices, DispatchEventFn } from "@/types/nodeModule";
import { VoiceAllocator } from "@audio/voiceAllocator";

type MidiToCvGraphNode = Extract<GraphNode, { type: "midiToCv" }>;

/**
 * Sentinel value indicating no active pitch.
 * VCO should output silence when it sees this value.
 */
export const PITCH_SILENT = -1000;

/**
 * Convert MIDI note to V/oct pitch CV.
 * Reference: 0V = C0 (MIDI note 0), 1V/octave
 * Formula: V/oct = midiNote / 12
 */
function midiNoteToVoct(note: number): number {
  return note / 12;
}

/**
 * Convert MIDI velocity (0-127) to normalized CV (0-1).
 */
function velocityToCv(velocity: number): number {
  return velocity / 127;
}

function createMidiToCvRuntime(
  ctx: AudioContext,
  nodeId: NodeId,
  dispatchEvent: DispatchEventFn
): AudioNodeInstance<MidiToCvGraphNode> {
  let graphRef: GraphState | null = null;

  // Create voice allocator
  const allocator = new VoiceAllocator(8, {
    nodeId,
    getGraphRef: () => graphRef,
    dispatchEvent,
    getCurrentTime: () => ctx.currentTime,
  });

  // Map from MIDI note to voice index for note-off lookup
  const noteToVoice = new Map<number, number>();

  // Create ConstantSourceNodes for all voices
  const pitchSources: ConstantSourceNode[] = [];
  const velocitySources: ConstantSourceNode[] = [];

  function ensureAudioNodes(count: number) {
    // Add new audio nodes if needed
    while (pitchSources.length < count) {
      const pitch = ctx.createConstantSource();
      pitch.offset.value = PITCH_SILENT; // Silent until note played
      pitch.start();
      pitchSources.push(pitch);

      const vel = ctx.createConstantSource();
      vel.offset.value = 0;
      vel.start();
      velocitySources.push(vel);
    }
  }

  function handleNoteOn(note: number, velocity: number) {
    // If this note is already playing, reuse its voice
    const existingVoice = noteToVoice.get(note);

    let voiceIdx: number;
    if (existingVoice !== undefined) {
      // Note is already playing - retrigger on same voice
      voiceIdx = existingVoice;
    } else {
      // Allocate a new voice
      const allocated = allocator.allocate();
      if (allocated === null) {
        // No voice available (shouldn't happen with current allocator logic)
        return;
      }
      voiceIdx = allocated;
    }

    // Mark voice as actively playing a note
    allocator.markNoteActive(voiceIdx);

    // Set pitch and velocity CV
    const vOct = midiNoteToVoct(note);
    const velCv = velocityToCv(velocity);

    pitchSources[voiceIdx].offset.setValueAtTime(vOct, ctx.currentTime);
    velocitySources[voiceIdx].offset.setValueAtTime(velCv, ctx.currentTime);

    // Track note-to-voice mapping
    noteToVoice.set(note, voiceIdx);

    // Dispatch gate on
    if (graphRef) {
      dispatchEvent(graphRef, nodeId, "gate_out", {
        type: "gate",
        voice: voiceIdx,
        state: "on",
        time: ctx.currentTime,
      });
    }
  }

  function handleNoteOff(note: number) {
    const voiceIdx = noteToVoice.get(note);
    if (voiceIdx === undefined) return;

    // Keep pitch CV at current value - envelope release needs it!

    // Clear note-to-voice mapping
    noteToVoice.delete(note);

    // Mark voice as note-off in allocator (consumers may still hold it)
    allocator.noteOff(voiceIdx);

    // Dispatch gate off - envelope will handle release phase
    if (graphRef) {
      dispatchEvent(graphRef, nodeId, "gate_out", {
        type: "gate",
        voice: voiceIdx,
        state: "off",
        time: ctx.currentTime,
      });
    }
  }

  // Initialize with default voice count
  ensureAudioNodes(allocator.getVoiceCount());

  return {
    type: "midiToCv",
    voiceAllocator: allocator,
    updateState: (state) => {
      const currentCount = allocator.getVoiceCount();
      if (state.voiceCount !== currentCount) {
        // Ensure we have enough audio nodes first
        ensureAudioNodes(state.voiceCount);
        // Then request resize from allocator (may be deferred for shrinking)
        allocator.requestResize(state.voiceCount);
      }
    },
    setGraphRef: (graph) => {
      graphRef = graph;
    },
    getAudioOutputs: (portId) => {
      const count = allocator.getVoiceCount();
      if (portId === "pitch_out") {
        return pitchSources.slice(0, count);
      }
      if (portId === "velocity_out") {
        return velocitySources.slice(0, count);
      }
      return [];
    },
    handleMidi: (event: MidiEvent, portId) => {
      if (portId && portId !== "midi_in") return;

      if (event.type === "noteOn") {
        handleNoteOn(event.note, event.velocity);
      } else if (event.type === "noteOff") {
        handleNoteOff(event.note);
      }
      // CC events are passed through but not processed here
    },
    onRemove: () => {
      for (const source of pitchSources) {
        try {
          source.stop();
          source.disconnect();
        } catch {
          // ignore
        }
      }
      for (const source of velocitySources) {
        try {
          source.stop();
          source.disconnect();
        } catch {
          // ignore
        }
      }
      pitchSources.length = 0;
      velocitySources.length = 0;
    },
    getRuntimeState: () => ({
      activeVoices: [...noteToVoice.values()],
      voiceCount: allocator.getVoiceCount(),
      targetVoiceCount: allocator.getTargetVoiceCount(),
      allocationState: allocator.getAllocationState(),
    }),
  };
}

export function midiToCvAudioFactory(
  services: AudioNodeServices
): AudioNodeFactory<MidiToCvGraphNode> {
  return {
    type: "midiToCv",
    create: (ctx, nodeId) => createMidiToCvRuntime(ctx, nodeId, services.dispatchEvent),
  };
}
