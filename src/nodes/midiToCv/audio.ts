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

/**
 * Convert MIDI pitch bend (-8192 to 8191) to semitones.
 * MPE typically uses ±48 semitones range.
 */
function pitchBendToSemitones(value: number, range: number = 48): number {
  return (value / 8192) * range;
}

/**
 * Convert MIDI pressure/aftertouch (0-127) to normalized CV (0-1).
 */
function pressureToCv(value: number): number {
  return value / 127;
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
  // Map from MIDI channel to voice index for MPE (pitch bend, aftertouch)
  const channelToVoice = new Map<number, number>();

  // Create ConstantSourceNodes for all voices
  const pitchSources: ConstantSourceNode[] = [];
  const velocitySources: ConstantSourceNode[] = [];
  const pressureSources: ConstantSourceNode[] = [];
  const slideSources: ConstantSourceNode[] = [];

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

      const pressure = ctx.createConstantSource();
      pressure.offset.value = 0;
      pressure.start();
      pressureSources.push(pressure);

      const slide = ctx.createConstantSource();
      slide.offset.value = 0; // Semitones offset from base pitch
      slide.start();
      slideSources.push(slide);
    }
  }

  function handleNoteOn(note: number, velocity: number, channel: number) {
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
    // Reset pressure and slide for new note
    pressureSources[voiceIdx].offset.setValueAtTime(0, ctx.currentTime);
    slideSources[voiceIdx].offset.setValueAtTime(0, ctx.currentTime);

    // Track note-to-voice and channel-to-voice mappings (for MPE)
    noteToVoice.set(note, voiceIdx);
    channelToVoice.set(channel, voiceIdx);

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

  function handleNoteOff(note: number, channel: number) {
    const voiceIdx = noteToVoice.get(note);
    if (voiceIdx === undefined) return;

    // Keep pitch CV at current value - envelope release needs it!

    // Clear note-to-voice and channel-to-voice mappings
    noteToVoice.delete(note);
    channelToVoice.delete(channel);

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

  function handlePitchBend(value: number, channel: number) {
    const voiceIdx = channelToVoice.get(channel);
    if (voiceIdx === undefined) return;

    // Convert pitch bend to semitones (MPE uses ±48 range typically)
    const semitones = pitchBendToSemitones(value, 48);
    slideSources[voiceIdx].offset.setValueAtTime(semitones / 12, ctx.currentTime);
  }

  function handleAftertouch(value: number, channel: number) {
    const voiceIdx = channelToVoice.get(channel);
    if (voiceIdx === undefined) return;

    const cv = pressureToCv(value);
    pressureSources[voiceIdx].offset.setValueAtTime(cv, ctx.currentTime);
  }

  function handlePolyAftertouch(note: number, value: number) {
    const voiceIdx = noteToVoice.get(note);
    if (voiceIdx === undefined) return;

    const cv = pressureToCv(value);
    pressureSources[voiceIdx].offset.setValueAtTime(cv, ctx.currentTime);
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
      if (portId === "pressure_out") {
        return pressureSources.slice(0, count);
      }
      if (portId === "slide_out") {
        return slideSources.slice(0, count);
      }
      return [];
    },
    handleMidi: (event: MidiEvent, portId) => {
      if (portId && portId !== "midi_in") return;

      if (event.type === "noteOn") {
        handleNoteOn(event.note, event.velocity, event.channel);
      } else if (event.type === "noteOff") {
        handleNoteOff(event.note, event.channel);
      } else if (event.type === "pitchBend") {
        handlePitchBend(event.value, event.channel);
      } else if (event.type === "aftertouch") {
        handleAftertouch(event.value, event.channel);
      } else if (event.type === "polyAftertouch") {
        handlePolyAftertouch(event.note, event.value);
      }
      // CC events are passed through but not processed here
    },
    onRemove: () => {
      const allSources = [
        ...pitchSources,
        ...velocitySources,
        ...pressureSources,
        ...slideSources,
      ];
      for (const source of allSources) {
        try {
          source.stop();
          source.disconnect();
        } catch {
          // ignore
        }
      }
      pitchSources.length = 0;
      velocitySources.length = 0;
      pressureSources.length = 0;
      slideSources.length = 0;
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
