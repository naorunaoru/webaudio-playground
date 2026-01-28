import type { DragState, GraphNode } from "@graph/types";
import { portKindColor } from "@graph/nodeRegistry";
import { bezierPath } from "@graph/coordinates";
import { NODE_HEADER_HEIGHT, PORT_ROW_HEIGHT } from "@graph/layout";
import { portById, portColumnIndex, portMetaForNode } from "@graph/graphUtils";

export type DragConnectionPreviewProps = {
  drag: DragState;
  getNode: (nodeId: string) => GraphNode | undefined;
  nodeWidths: Record<string, number>;
};

export function DragConnectionPreview({
  drag,
  getNode,
  nodeWidths,
}: DragConnectionPreviewProps) {
  if (drag.type !== "connect") return null;

  const fromNode = getNode(drag.from.nodeId);
  if (!fromNode) return null;

  const ports = portMetaForNode(fromNode);
  const fromPort = portById(fromNode, drag.from.portId);
  if (!fromPort) return null;

  const fromColIdx = portColumnIndex(ports, fromPort.id);
  const width = nodeWidths[fromNode.id] ?? 240;
  const x = fromPort.direction === "in" ? fromNode.x : fromNode.x + width;
  const y =
    fromNode.y +
    NODE_HEADER_HEIGHT +
    fromColIdx * PORT_ROW_HEIGHT +
    PORT_ROW_HEIGHT / 2;
  const d = bezierPath(x, y, drag.toX, drag.toY);

  return (
    <path
      d={d}
      fill="none"
      stroke={portKindColor(drag.kind)}
      strokeOpacity={0.5}
      strokeWidth={2.25}
      strokeDasharray="6 6"
    />
  );
}
