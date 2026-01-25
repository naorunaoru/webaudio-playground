import type { GraphNode, MidiEvent } from "@graph/types";
import type { AudioNodeFactory, AudioNodeInstance } from "@/types/audioRuntime";
import type { AudioNodeServices } from "@/types/nodeModule";
import type { MidiMonitorRuntimeState } from "./types";

type MidiMonitorNode = Extract<GraphNode, { type: "midiMonitor" }>;

function createMidiMonitorRuntime(): AudioNodeInstance<MidiMonitorNode> {
  let maxEvents = 10;
  const events: MidiEvent[] = [];

  return {
    type: "midiMonitor",

    updateState: (state) => {
      maxEvents = state.maxEvents;
      // Trim events if max changed
      while (events.length > maxEvents) {
        events.shift();
      }
    },

    handleMidi: (event: MidiEvent) => {
      events.push(event);
      while (events.length > maxEvents) {
        events.shift();
      }
      // Pass through - don't consume
      return {};
    },

    getRuntimeState: (): MidiMonitorRuntimeState => ({
      events: [...events],
    }),

    onRemove: () => {
      events.length = 0;
    },
  };
}

export function midiMonitorAudioFactory(
  _services: AudioNodeServices
): AudioNodeFactory<MidiMonitorNode> {
  return {
    type: "midiMonitor",
    create: () => createMidiMonitorRuntime(),
  };
}
