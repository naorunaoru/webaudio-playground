import type { GraphNode, GraphState, MidiEvent, NodeId } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices, DispatchEventFn } from "@/types/nodeModule";

type MidiToCvGraphNode = Extract<GraphNode, { type: "midiToCv" }>;

type Voice = {
  note: number;
  velocity: number;
  pitchSource: ConstantSourceNode;
  velocitySource: ConstantSourceNode;
};

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
  let voiceCount = 8;
  let graphRef: GraphState | null = null;

  // Voice pool: array of voices, index = voice number
  // null = free, Voice = allocated
  const voices: (Voice | null)[] = Array(voiceCount).fill(null);

  // FIFO queue for voice allocation (oldest first)
  const allocationOrder: number[] = [];

  // Map from MIDI note to voice index for note-off lookup
  const noteToVoice = new Map<number, number>();

  // Create ConstantSourceNodes for all voices
  const pitchSources: ConstantSourceNode[] = [];
  const velocitySources: ConstantSourceNode[] = [];

  function ensureVoiceCount(count: number) {
    // Add new voices if needed
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
    // Update voice array size
    while (voices.length < count) {
      voices.push(null);
    }
    voiceCount = count;
  }

  function allocateVoice(): number {
    // Find first free voice
    for (let i = 0; i < voiceCount; i++) {
      if (voices[i] === null) {
        return i;
      }
    }
    // No free voice - steal oldest (FIFO)
    if (allocationOrder.length > 0) {
      const oldest = allocationOrder.shift()!;
      // Send gate off for stolen voice
      if (graphRef && voices[oldest]) {
        const stolenNote = voices[oldest]!.note;
        noteToVoice.delete(stolenNote);
        dispatchEvent(graphRef, nodeId, "gate_out", {
          type: "gate",
          voice: oldest,
          state: "off",
          time: ctx.currentTime,
        });
      }
      return oldest;
    }
    return 0;
  }

  function handleNoteOn(note: number, velocity: number) {
    // If this note is already playing, reuse its voice
    let voiceIdx = noteToVoice.get(note);

    if (voiceIdx === undefined) {
      voiceIdx = allocateVoice();
    } else {
      // Remove from allocation order, will re-add at end
      const orderIdx = allocationOrder.indexOf(voiceIdx);
      if (orderIdx !== -1) allocationOrder.splice(orderIdx, 1);
    }

    // Set pitch and velocity CV
    const vOct = midiNoteToVoct(note);
    const velCv = velocityToCv(velocity);

    pitchSources[voiceIdx].offset.setValueAtTime(vOct, ctx.currentTime);
    velocitySources[voiceIdx].offset.setValueAtTime(velCv, ctx.currentTime);

    // Track voice
    voices[voiceIdx] = { note, velocity, pitchSource: pitchSources[voiceIdx], velocitySource: velocitySources[voiceIdx] };
    noteToVoice.set(note, voiceIdx);
    allocationOrder.push(voiceIdx);

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
    // Only clear velocity (though envelope may also use this during release)
    // velocitySources[voiceIdx].offset.setValueAtTime(0, ctx.currentTime);

    // Free the voice for reallocation
    voices[voiceIdx] = null;
    noteToVoice.delete(note);

    // Remove from allocation order
    const orderIdx = allocationOrder.indexOf(voiceIdx);
    if (orderIdx !== -1) allocationOrder.splice(orderIdx, 1);

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
  ensureVoiceCount(voiceCount);

  return {
    type: "midiToCv",
    updateState: (state) => {
      if (state.voiceCount !== voiceCount) {
        ensureVoiceCount(state.voiceCount);
      }
    },
    setGraphRef: (graph) => {
      graphRef = graph;
    },
    getAudioOutputs: (portId) => {
      if (portId === "pitch_out") {
        return pitchSources.slice(0, voiceCount);
      }
      if (portId === "velocity_out") {
        return velocitySources.slice(0, voiceCount);
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
      activeVoices: voices.filter(v => v !== null).map(v => v!.note),
      voiceCount,
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
