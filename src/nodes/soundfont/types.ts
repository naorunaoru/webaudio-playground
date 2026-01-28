export type SoundfontState = {
  soundfontId: string | null;
  soundfontName: string | null;
  gain: number;
  bank: number;
  program: number;
  channel: number; // 0 = all, 1-16 = specific channel
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    soundfont: SoundfontState;
  }
}
