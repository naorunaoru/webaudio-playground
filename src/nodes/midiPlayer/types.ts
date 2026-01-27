export type MidiPlayerState = {
  midiId: string | null;
  midiName: string | null;
  loop: boolean;
  tempoMultiplier: number; // 0.5 to 2.0
  // Note: "playing" is runtime-only state, not persisted in Automerge
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    midiPlayer: MidiPlayerState;
  }
}
