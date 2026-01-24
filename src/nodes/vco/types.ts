export type VcoWaveform = "sine" | "triangle" | "square" | "sawtooth";

export type VcoState = {
  waveform: VcoWaveform;
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    vco: VcoState;
  }
}
