export type MidiToCvState = {
  voiceCount: number;
  channel: number; // 0 = All channels, 1-16 = specific channel
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    midiToCv: MidiToCvState;
  }
}
