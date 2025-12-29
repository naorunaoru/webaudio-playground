export type OscillatorSource = "wave" | "noise";

export type OscillatorState = {
  source: OscillatorSource;
  waveform: OscillatorType;
  lastMidiNote: number | null;
  lastMidiAtMs: number | null;
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    oscillator: OscillatorState;
  }
}
