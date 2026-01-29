import { useEffect, useRef, useState } from "react";
import type { NodeId } from "@graph/types";

export type NodeDimensions = Record<string, { width: number; height: number }>;

export function useNodeDimensions() {
  const nodeElsRef = useRef(new Map<NodeId, HTMLElement>());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [nodeDimensions, setNodeDimensions] = useState<NodeDimensions>({});

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      setNodeDimensions((prev) => {
        let next: NodeDimensions | null = null;
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const nodeId = el.getAttribute("data-node-id");
          if (!nodeId) continue;
          const w = Math.max(0, Math.round(entry.contentRect.width));
          const h = Math.max(0, Math.round(entry.contentRect.height));
          const existing = prev[nodeId];
          if (existing && existing.width === w && existing.height === h)
            continue;
          next ??= { ...prev };
          next[nodeId] = { width: w, height: h };
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

  return { nodeDimensions, registerNodeEl };
}
