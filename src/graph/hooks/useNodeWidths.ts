import { useEffect, useRef, useState } from "react";
import type { NodeId } from "@graph/types";

export function useNodeWidths() {
  const nodeElsRef = useRef(new Map<NodeId, HTMLElement>());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [nodeWidths, setNodeWidths] = useState<Record<string, number>>({});

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      setNodeWidths((prev) => {
        let next: Record<string, number> | null = null;
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const nodeId = el.getAttribute("data-node-id");
          if (!nodeId) continue;
          const w = Math.max(0, Math.round(entry.contentRect.width));
          if (prev[nodeId] === w) continue;
          next ??= { ...prev };
          next[nodeId] = w;
        }
        return next ?? prev;
      });
    });
    resizeObserverRef.current = ro;
    for (const el of nodeElsRef.current.values()) ro.observe(el);
    return () => {
      ro.disconnect();
      resizeObserverRef.current = null;
    };
  }, []);

  const registerNodeEl = (nodeId: NodeId, el: HTMLElement | null) => {
    const ro = resizeObserverRef.current;
    if (!el) {
      const prev = nodeElsRef.current.get(nodeId);
      if (prev && ro) ro.unobserve(prev);
      nodeElsRef.current.delete(nodeId);
      return;
    }
    nodeElsRef.current.set(nodeId, el);
    if (ro) ro.observe(el);
  };

  return { nodeWidths, registerNodeEl };
}
