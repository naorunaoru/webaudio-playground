import { useEffect, useRef, useState } from "react";
import type {
  ConnectionEndpoint,
  DragState,
  GraphNode,
  GraphState,
} from "../types";
import { localPointFromClientPoint, viewToWorld } from "../coordinates";

type UseDragInteractionOptions = {
  rootRef: React.RefObject<HTMLElement | null>;
  scrollRef: React.RefObject<{ x: number; y: number } | null>;
  onMoveNode: (nodeId: string, x: number, y: number) => void;
  onConnect: (from: ConnectionEndpoint, to: ConnectionEndpoint) => void;
};

export function useDragInteraction({
  rootRef,
  scrollRef,
  onMoveNode,
  onConnect,
}: UseDragInteractionOptions) {
  const [drag, setDrag] = useState<DragState>({ type: "none" });
  const dragRef = useRef<DragState>({ type: "none" });

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  useEffect(() => {
    if (drag.type === "none") return;

    const onPointerMove = (e: PointerEvent) => {
      const root = rootRef.current;
      const currentScroll = scrollRef.current;
      if (!root || !currentScroll) return;

      const currentDrag = dragRef.current;

      const p = localPointFromClientPoint(root, e.clientX, e.clientY);
      const gp = viewToWorld(p, currentScroll.x, currentScroll.y);

      if (currentDrag.type === "moveNode") {
        onMoveNode(
          currentDrag.nodeId,
          gp.x - currentDrag.offsetX,
          gp.y - currentDrag.offsetY
        );
        return;
      }

      if (currentDrag.type === "connect") {
        setDrag((prev) =>
          prev.type === "connect" ? { ...prev, toX: gp.x, toY: gp.y } : prev
        );
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const currentDrag = dragRef.current;
      if (currentDrag.type === "connect") {
        const target = document.elementFromPoint(
          e.clientX,
          e.clientY
        ) as Element | null;
        const portEl = target?.closest?.(
          '[data-port="1"]'
        ) as HTMLElement | null;
        if (portEl) {
          const toNodeId = portEl.getAttribute("data-node-id");
          const toPortId = portEl.getAttribute("data-port-id");
          const toDirection = portEl.getAttribute("data-port-direction");
          if (toNodeId && toPortId && toDirection === "in") {
            onConnect(currentDrag.from, {
              nodeId: toNodeId,
              portId: toPortId,
            });
          }
        }
      }
      setDrag({ type: "none" });
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [drag.type, rootRef, scrollRef, onMoveNode, onConnect]);

  return { drag, setDrag };
}
