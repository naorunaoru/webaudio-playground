export type MidiSourceState = {
  note: number;
  velocity: number;
  channel: number;
  isEmitting: boolean;
  lastTriggeredAtMs: number | null;
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    midiSource: MidiSourceState;
  }
}

