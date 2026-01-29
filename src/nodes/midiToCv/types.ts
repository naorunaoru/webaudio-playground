export type MidiToCvMode = "polyphony" | "portamento";

export type MidiToCvState = {
  mode: MidiToCvMode;
  voiceCount: number;
  portamentoMs: number; // glide time in ms (used in portamento mode)
  channel: number; // 0 = All channels, 1-16 = specific channel
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    midiToCv: MidiToCvState;
  }
}
