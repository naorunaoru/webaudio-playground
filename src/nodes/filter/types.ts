export type FilterType = "lowpass" | "highpass";

export type FilterState = {
  type: FilterType;
  frequencyHz: number; // 20..20000
  q: number; // 0.0001..30
  envAmountHz: number; // 0..20000 (added to frequency)
};

declare module "../../graph/types" {
  interface NodeTypeMap {
    filter: FilterState;
  }
}

