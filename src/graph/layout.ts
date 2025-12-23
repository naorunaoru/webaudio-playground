import type { GraphNode, PortSpec } from "./types";

export const NODE_WIDTH = 240;
export const NODE_HEADER_HEIGHT = 28;
export const NODE_PADDING = 12;
export const PORT_ROW_HEIGHT = 20;
export const PORT_RADIUS = 6;

export type PortPosition = Readonly<{
  cx: number;
  cy: number;
}>;

export function nodeHeight(portCount: number): number {
  const portsHeight = Math.max(1, portCount) * PORT_ROW_HEIGHT;
  const minBody = 200;
  return Math.max(NODE_HEADER_HEIGHT + NODE_PADDING + portsHeight + NODE_PADDING, minBody);
}

export function portPosition(
  node: GraphNode,
  port: PortSpec,
  portIndex: number,
  portsTotal: number,
): PortPosition {
  const height = nodeHeight(portsTotal);
  const top = node.y;
  const left = node.x;

  const portsTop = top + NODE_HEADER_HEIGHT + NODE_PADDING;
  const cy = portsTop + portIndex * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2;
  const cx = port.direction === "in" ? left : left + NODE_WIDTH;
  const clampedCy = Math.min(top + height - NODE_PADDING, Math.max(portsTop, cy));
  return { cx, cy: clampedCy };
}
