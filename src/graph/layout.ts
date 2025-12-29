export const NODE_WIDTH = 240;
export const NODE_HEADER_HEIGHT = 28;
export const NODE_PADDING = 12;
export const PORT_ROW_HEIGHT = 20;

export function nodeHeight(portCount: number): number {
  const portsHeight = Math.max(1, portCount) * PORT_ROW_HEIGHT;
  const minBody = 200;
  return Math.max(
    NODE_HEADER_HEIGHT + NODE_PADDING + portsHeight + NODE_PADDING,
    minBody
  );
}
