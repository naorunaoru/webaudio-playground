export type AudioOutState = Record<string, never>;

declare module "../../graph/types" {
  interface NodeTypeMap {
    audioOut: AudioOutState;
  }
}

