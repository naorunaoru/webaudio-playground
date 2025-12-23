import type { PortKind } from "./types";

const KIND_COLOR: Record<PortKind, string> = {
  audio: "#88c0d0",
  midi: "#b48ead",
  cc: "#8fbcbb",
  automation: "#d08770",
};

export function portKindColor(kind: PortKind): string {
  return KIND_COLOR[kind];
}

