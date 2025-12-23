export type AudioOutState = {
  lastAudioAtMs: number | null;
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    audioOut: AudioOutState;
  }
}

