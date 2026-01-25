export type MidiToCvState = {
  voiceCount: number;
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    midiToCv: MidiToCvState;
  }
}
