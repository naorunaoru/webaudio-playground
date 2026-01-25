import type { MidiEvent } from "@graph/types";

export type MidiMonitorState = {
  maxEvents: number;
};

export type MidiMonitorRuntimeState = {
  events: MidiEvent[];
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    midiMonitor: MidiMonitorState;
  }
}
