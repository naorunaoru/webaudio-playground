import { portKindColor } from "./portColors";
import type { NodeDefinition, NodeUiProps } from "@/types/graphNodeDefinition";
import { NODE_MODULES } from "@nodes";

export type { NodeDefinition, NodeUiProps };
export { portKindColor };

export function getNodeDef<TType extends keyof typeof NODE_MODULES>(type: TType) {
  return NODE_MODULES[type].graph;
}
