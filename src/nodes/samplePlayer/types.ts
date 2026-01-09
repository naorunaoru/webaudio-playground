export type SamplePlayerState = {
  sampleId: string | null;
  sampleName: string | null;
  gain: number; // 0..2
  followPitch: boolean;
  rootNote: number; // 0..127
  stopOnNoteOff: boolean;
  loop: boolean;
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    samplePlayer: SamplePlayerState;
  }
}

