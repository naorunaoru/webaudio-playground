import type { DragState, GraphNode, GraphState, PortKind } from "../types";
import { portKindColor } from "../nodeRegistry";
import { bezierPath } from "../coordinates";
import { NODE_HEADER_HEIGHT, PORT_ROW_HEIGHT } from "../layout";
import { findNode, portById, portMetaForNode } from "../graphUtils";

export type DragConnectionPreviewProps = {
  drag: DragState;
  graph: GraphState;
  nodeWidths: Record<string, number>;
};

export function DragConnectionPreview({
  drag,
  graph,
  nodeWidths,
}: DragConnectionPreviewProps) {
  if (drag.type !== "connect") return null;

  const fromNode = findNode(graph, drag.from.nodeId);
  if (!fromNode) return null;

  const ports = portMetaForNode(fromNode);
  const fromPort = portById(fromNode, drag.from.portId);
  if (!fromPort) return null;

  const fromIndex = ports.findIndex((p) => p.id === fromPort.id);
  const width = nodeWidths[fromNode.id] ?? 240;
  const x = fromPort.direction === "in" ? fromNode.x : fromNode.x + width;
  const y =
    fromNode.y +
    NODE_HEADER_HEIGHT +
    fromIndex * PORT_ROW_HEIGHT +
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
