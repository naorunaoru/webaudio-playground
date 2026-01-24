import type { PortKind } from "./types";

const KIND_COLOR: Record<PortKind, string> = {
  audio: "#88c0d0",
  cv: "#d08770",
  pitch: "#a3be8c",
  gate: "#bf616a",
  trigger: "#ebcb8b",
  midi: "#b48ead",
};

export function portKindColor(kind: PortKind): string {
  return KIND_COLOR[kind];
}

