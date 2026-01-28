import { forwardRef, useCallback, useImperativeHandle, useMemo } from "react";
import type {
  ConnectionEndpoint,
  GraphNode,
  NodeId,
  PortKind,
} from "@graph/types";
import type { StructuralState } from "@state";
import { localPointFromPointerEvent, viewToWorld } from "@graph/coordinates";
import { portMetaForNode } from "@graph/graphUtils";
import { nodeHeight } from "@graph/layout";
import { useDragInteraction } from "@graph/hooks";
import { DragConnectionPreview } from "./DragConnectionPreview";
import styles from "./DragInteractionLayer.module.css";

export type DragInteractionLayerHandle = {
  startNodeDrag: (
    nodeOffsets: Map<NodeId, { offsetX: number; offsetY: number }>,
  ) => void;
  startConnectionDrag: (
    from: ConnectionEndpoint,
    kind: PortKind,
    x: number,
    y: number,
  ) => void;
  endDrag: () => void;
  onWorldPointerDown: (e: React.PointerEvent) => void;
  onWorldPointerMove: (e: React.PointerEvent) => void;
  onWorldPointerUp: (e: React.PointerEvent) => void;
};

type DragInteractionLayerProps = {
  rootRef: React.RefObject<HTMLElement | null>;
  scrollRef: React.RefObject<{ x: number; y: number } | null>;
  onMoveNodes: (moves: Map<string, { x: number; y: number }>) => void;
  onConnect: (from: ConnectionEndpoint, to: ConnectionEndpoint) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  getNode: (nodeId: string) => GraphNode | undefined;
  nodeWidths: Record<string, number>;
  structural: StructuralState;
  selectNodes: (nodeIds: Set<NodeId>) => void;
  deselect: () => void;
};

export const DragInteractionLayer = forwardRef<
  DragInteractionLayerHandle,
  DragInteractionLayerProps
>(function DragInteractionLayer(
  {
    rootRef,
    scrollRef,
    onMoveNodes,
    onConnect,
    onDragStart,
    onDragEnd,
    getNode,
    nodeWidths,
    structural,
    selectNodes,
    deselect,
  },
  ref,
) {
  const { drag, setDrag } = useDragInteraction({
    rootRef,
    scrollRef,
    onMoveNodes,
    onConnect,
    onDragStart,
    onDragEnd,
  });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      if (drag.type !== "none") return;

      const root = rootRef.current;
      if (!root) return;

      const local = localPointFromPointerEvent(root, e);
      const scroll = scrollRef.current;
      if (!scroll) return;
      const world = viewToWorld(local, scroll.x, scroll.y);

      setDrag({
        type: "marquee",
        startX: world.x,
        startY: world.y,
        currentX: world.x,
        currentY: world.y,
      });

      deselect();
    },
    [drag.type, setDrag, rootRef, scrollRef, deselect],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (drag.type !== "marquee") return;

      const root = rootRef.current;
      if (!root) return;

      const local = localPointFromPointerEvent(root, e);
      const scroll = scrollRef.current;
      if (!scroll) return;
      const world = viewToWorld(local, scroll.x, scroll.y);

      setDrag({
        ...drag,
        currentX: world.x,
        currentY: world.y,
      });
    },
    [drag, setDrag, rootRef, scrollRef],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (drag.type !== "marquee") return;

      const root = rootRef.current;
      if (!root) return;

      const local = localPointFromPointerEvent(root, e);
      const scroll = scrollRef.current;
      if (!scroll) return;
      const world = viewToWorld(local, scroll.x, scroll.y);

      const minX = Math.min(drag.startX, world.x);
      const maxX = Math.max(drag.startX, world.x);
      const minY = Math.min(drag.startY, world.y);
      const maxY = Math.max(drag.startY, world.y);

      const selectedNodeIds = new Set<string>();
      for (const nodeId of structural.nodeIds) {
        const node = getNode(nodeId);
        if (!node) continue;

        const nodeWidth = nodeWidths[node.id] ?? 240;
        const ports = portMetaForNode(node);
        const nodeH = nodeHeight(ports.length);

        const nodeRight = node.x + nodeWidth;
        const nodeBottom = node.y + nodeH;

        if (
          node.x < maxX &&
          nodeRight > minX &&
          node.y < maxY &&
          nodeBottom > minY
        ) {
          selectedNodeIds.add(node.id);
        }
      }

      selectNodes(selectedNodeIds);
      setDrag({ type: "none" });
    },
    [
      drag,
      structural,
      getNode,
      nodeWidths,
      selectNodes,
      setDrag,
      rootRef,
      scrollRef,
    ],
  );

  useImperativeHandle(
    ref,
    () => ({
      startNodeDrag(
        nodeOffsets: Map<NodeId, { offsetX: number; offsetY: number }>,
      ) {
        setDrag({ type: "moveNodes", nodeOffsets });
      },
      startConnectionDrag(
        from: ConnectionEndpoint,
        kind: PortKind,
        x: number,
        y: number,
      ) {
        setDrag({ type: "connect", from, kind, toX: x, toY: y });
      },
      endDrag() {
        setDrag({ type: "none" });
      },
      onWorldPointerDown: handlePointerDown,
      onWorldPointerMove: handlePointerMove,
      onWorldPointerUp: handlePointerUp,
    }),
    [setDrag, handlePointerDown, handlePointerMove, handlePointerUp],
  );

  const marqueeRect = useMemo(() => {
    if (drag.type !== "marquee") return null;
    const x = Math.min(drag.startX, drag.currentX);
    const y = Math.min(drag.startY, drag.currentY);
    const width = Math.abs(drag.currentX - drag.startX);
    const height = Math.abs(drag.currentY - drag.startY);
    return { x, y, width, height };
  }, [drag]);

  return (
    <>
      <svg className={styles.canvas}>
        <DragConnectionPreview
          drag={drag}
          getNode={getNode}
          nodeWidths={nodeWidths}
        />
      </svg>

      {marqueeRect && (
        <div
          className={styles.marquee}
          style={{
            left: marqueeRect.x,
            top: marqueeRect.y,
            width: marqueeRect.width,
            height: marqueeRect.height,
          }}
        />
      )}
    </>
  );
});
