export type OscillatorSource = "wave" | "noise";

export type OscillatorState = {
  source: OscillatorSource;
  waveform: OscillatorType;
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    oscillator: OscillatorState;
  }
}
