export type MidiPitchState = {
  a4Hz: number; // 200..1000
  ratio: number; // 0.25..16
  detuneCents: number; // -1200..1200
  glideMs: number; // 0..5000
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    midiPitch: MidiPitchState;
  }
}

