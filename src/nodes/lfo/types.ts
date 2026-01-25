export type LfoWaveform =
  | "sine"
  | "triangle"
  | "square"
  | "sawtooth"
  | "sawtoothDown";

export type LfoState = {
  waveform: LfoWaveform;
  frequencyHz: number;
  rangeMin: number;
  rangeMax: number;
  oneShot: boolean;
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    lfo: LfoState;
  }
}
